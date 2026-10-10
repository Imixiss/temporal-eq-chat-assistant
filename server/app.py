"""分析服务：POST /api/analyze + POST /api/ocr

职责：
1. 逐轮情绪识别：中文走 RoBERTa（outputs/checkpoints/erc_zh），英文走 TF-IDF 基线；
2. 计算时序指标与冲突风险启发式（规则未验证，见 conflict_heuristic.py 声明）；
3. 若请求头或 configs/llm.yaml 提供了 LLM 配置，则代理调用 OpenAI 兼容接口，
   生成局势分析/沟通建议/回复草稿；否则 suggestions=null, llm_status="not_configured"。
4. /api/ocr：调用 scripts/ocr.swift（macOS Vision）本机离线识别聊天截图。

启动：PYTHONPATH=. uvicorn server.app:app --port 8000
"""
import json
from pathlib import Path

import joblib
import requests
import yaml
from fastapi import FastAPI, Header, Request
from pydantic import BaseModel

from src.analysis.conflict_heuristic import assess
from src.analysis.emotion_trend import temporal_metrics
from src.utils.common import PROJECT_ROOT, load_config

cfg = load_config()
MODEL_PATH = PROJECT_ROOT / "outputs" / "checkpoints" / "erc_best_model.joblib"
ZH_MODEL_DIR = PROJECT_ROOT / "outputs" / "checkpoints" / "erc_zh"
NEG_EMOS = cfg["negative_emotions"]

app = FastAPI(title="EQ Assistant Analysis Service")

_model = None
_zh = None  # (tokenizer, model, labels, device)


def get_model():
    global _model
    if _model is None:
        _model = joblib.load(MODEL_PATH)
    return _model


def get_zh_model():
    """惰性加载中文 RoBERTa 情绪模型（W3 微调，微博数据）。

    注意：该模型在微博单帖上训练，逐轮对话场景属跨域应用，
    且标签集不含 disgust——见 docs/experiment_log.md 的 W3 记录。
    """
    global _zh
    if _zh is None:
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
        labels = json.loads((ZH_MODEL_DIR / "label_map.json").read_text(encoding="utf-8"))["labels"]
        tok = AutoTokenizer.from_pretrained(ZH_MODEL_DIR)
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        mdl = AutoModelForSequenceClassification.from_pretrained(ZH_MODEL_DIR).to(device).eval()
        _zh = (tok, mdl, labels, device)
    return _zh


def is_chinese(text: str) -> bool:
    """按 CJK 字符占比粗判语言，决定走中文还是英文模型。"""
    if not text:
        return False
    cjk = sum(1 for ch in text if "一" <= ch <= "鿿")
    return cjk / len(text) > 0.2


def predict_zh(text: str) -> tuple[str, float, dict]:
    import torch
    tok, mdl, labels, device = get_zh_model()
    enc = tok(text, truncation=True, max_length=128, return_tensors="pt").to(device)
    with torch.no_grad():
        proba = torch.softmax(mdl(**enc).logits, dim=-1)[0].cpu().tolist()
    probs = {l: round(float(p), 4) for l, p in zip(labels, proba)}
    pred = labels[int(torch.tensor(proba).argmax())]
    return pred, round(float(max(proba)), 4), probs


class TurnIn(BaseModel):
    speaker: str
    text: str


class AnalyzeIn(BaseModel):
    turns: list[TurnIn]


def load_llm_file_config() -> dict:
    p = PROJECT_ROOT / "configs" / "llm.yaml"
    if p.exists():
        with open(p, encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


LLM_SYSTEM_PROMPT = """你是一位高情商沟通顾问。用户会给你一段多轮对话，以及每轮的情绪识别结果（由机器学习模型给出，可能有个别误差，仅供参考）。

请基于整段对话的语境与情绪走向，严格输出 JSON（不要输出其他内容），格式：
{
  "situation_analysis": "2-4 句话：这段对话发生了什么，双方各自可能的诉求与情绪变化",
  "advice": ["3-5 条具体的沟通建议，每条一句话"],
  "reply_drafts": [
    {"style": "风格名（如：温和安抚型）", "text": "可直接发送的回复"},
    {"style": "风格名", "text": "..."},
    {"style": "风格名", "text": "..."}
  ]
}
要求：回复草稿要给 2-3 条不同风格；不要说教；如果对话是英文就用英文起草，中文就用中文。"""


def call_llm(turns: list[dict], key: str, base_url: str, model: str) -> dict:
    timeline = "\n".join(
        f"{i+1}. [{t['speaker']}] {t['text']}  （情绪: {t['emotion']}, 置信度 {t['confidence']:.2f}）"
        for i, t in enumerate(turns)
    )
    resp = requests.post(
        f"{base_url.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": LLM_SYSTEM_PROMPT},
                {"role": "user", "content": f"对话及情绪识别结果：\n{timeline}"},
            ],
            # 注意：kimi-k3 等模型仅允许 temperature=1，且不支持 response_format，
            # 如需这两个参数请先确认模型支持
        },
        timeout=60,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    return parse_llm_json(content)


def parse_llm_json(content: str) -> dict:
    """容错解析：去掉 ```json 围栏，截取首个 { 到末尾 } 的片段。"""
    import re
    s = content.strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.S).strip()
    if not s.startswith("{"):
        m = re.search(r"\{.*\}", s, flags=re.S)
        if m:
            s = m.group(0)
    return json.loads(s)


@app.get("/api/health")
def health():
    llm_file = load_llm_file_config()
    return {
        "status": "ok",
        "model_loaded": MODEL_PATH.exists(),
        "llm_configured_in_file": bool(llm_file.get("api_key")),
    }


OCR_SCRIPT = PROJECT_ROOT / "scripts" / "ocr.swift"


@app.post("/api/ocr")
async def ocr(request: Request):
    """聊天截图 → 文字。调用 macOS Vision 框架（本地离线识别，图片不出本机）。

    前端以原始字节 POST（Content-Type: image/*），避免依赖 python-multipart。
    仅在 macOS 上可用；返回 lines 供前端填入输入框，由用户确认后再分析。
    """
    import subprocess
    import tempfile

    if not OCR_SCRIPT.exists():
        return {"ok": False, "lines": [], "message": "OCR 脚本缺失：scripts/ocr.swift"}
    data = await request.body()
    if not data:
        return {"ok": False, "lines": [], "message": "未收到图片数据"}
    ctype = request.headers.get("content-type", "image/png")
    suffix = ".jpg" if "jpeg" in ctype else ".png"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        proc = subprocess.run(
            ["swift", str(OCR_SCRIPT), tmp_path],
            capture_output=True, text=True, timeout=120,
        )
        if proc.returncode != 0:
            return {"ok": False, "lines": [], "message": f"识别失败：{proc.stderr.strip()[:200]}"}
        lines = [l.strip() for l in proc.stdout.splitlines() if l.strip()]
        if not lines:
            return {"ok": False, "lines": [], "message": "没有识别到文字，请换一张更清晰的截图"}
        return {"ok": True, "lines": lines, "message": None}
    except subprocess.TimeoutExpired:
        return {"ok": False, "lines": [], "message": "识别超时"}
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@app.post("/api/analyze")
def analyze(
    body: AnalyzeIn,
    x_llm_key: str | None = Header(default=None),
    x_llm_base_url: str | None = Header(default=None),
    x_llm_model: str | None = Header(default=None),
):
    # 逐轮情绪识别：中文走 RoBERTa（W3），英文走 TF-IDF 基线 E1w
    turns = []
    for i, t in enumerate(body.turns):
        if is_chinese(t.text):
            pred, conf, probs = predict_zh(t.text)
        else:
            m = get_model()
            vec, clf = m["vectorizer"], m["clf"]
            X = vec.transform([t.text])  # 最佳模型 E1w 仅用当前轮文本
            proba = clf.predict_proba(X)[0]
            pred = clf.predict(X)[0]
            conf = round(float(proba.max()), 4)
            probs = {c: round(float(p), 4) for c, p in zip(m["classes"], proba)}
        turns.append({
            "turn_id": i,
            "speaker": t.speaker,
            "text": t.text,
            "emotion": pred,
            "confidence": conf,
            "probabilities": probs,
        })

    # 时序指标 + 风险启发式
    metric_input = [
        {"predicted_emotion": t["emotion"], "probabilities": t["probabilities"]}
        for t in turns
    ]
    metrics = temporal_metrics(metric_input, cfg["trend_score"], NEG_EMOS)
    risk = assess(metrics)

    # LLM 建议层：优先请求头，其次 configs/llm.yaml
    file_cfg = load_llm_file_config()
    key = x_llm_key or file_cfg.get("api_key")
    base_url = x_llm_base_url or file_cfg.get("base_url", "https://api.moonshot.cn/v1")
    model_name = x_llm_model or file_cfg.get("model", "kimi-k3")

    suggestions = None
    llm_status = "not_configured"
    llm_message = "未配置 LLM：在网页右上角「大模型设置」填入 API Key，或在 configs/llm.yaml 中配置"
    if key:
        try:
            suggestions = call_llm(turns, key, base_url, model_name)
            llm_status = "ok"
            llm_message = None
        except Exception as e:  # noqa: BLE001 - 把错误透传给前端展示
            llm_status = "error"
            llm_message = str(e)[:300]

    return {
        "turns": turns,
        "metrics": metrics,
        "risk": risk,
        "suggestions": suggestions,
        "llm_status": llm_status,
        "llm_message": llm_message,
    }
