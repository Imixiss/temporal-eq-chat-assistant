"""ERC 基线：多数类 / TF-IDF + Logistic Regression，含上下文消融。

实验表：
  E0  majority            无文本输入
  E1  tfidf_current       仅当前 utterance
  E1b tfidf_ctx_only      仅历史上下文（不含当前轮，用于验证"历史能带走多少信号"）
  E1w tfidf_current_bal   当前轮 + class_weight=balanced（检验类别不均衡处理）
  E2  tfidf_ctx1          最近 1 轮 + 当前轮
  E3  tfidf_ctx3          最近 3 轮 + 当前轮

输出：
  outputs/metrics/erc_results.json      全部指标
  outputs/metrics/erc_report_*.txt      分类报告
  outputs/figures/confusion_matrix.png  最佳模型混淆矩阵
  outputs/predictions/erc_test_predictions.jsonl  最佳模型逐轮概率
  outputs/checkpoints/erc_best_model.joblib       最佳模型（供 server/app.py 加载）
"""
import argparse
import json
from collections import Counter

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, classification_report,
                             confusion_matrix, f1_score)

from src.utils.common import (PROJECT_ROOT, load_config, read_jsonl,
                              set_seed, write_jsonl)


def build_text(sample: dict, mode: str) -> str:
    ctx = sample["context"]
    if mode == "current":
        return sample["text"]
    if mode == "ctx_only":
        return " ".join(ctx) if ctx else "<empty>"
    if mode == "ctx1":
        return " ".join(ctx[-1:] + [sample["text"]])
    if mode == "ctx3":
        return " ".join(ctx[-3:] + [sample["text"]])
    raise ValueError(mode)


def evaluate(y_true, y_pred, labels) -> dict:
    return {
        "accuracy": round(accuracy_score(y_true, y_pred), 4),
        "macro_f1": round(f1_score(y_true, y_pred, labels=labels, average="macro", zero_division=0), 4),
        "weighted_f1": round(f1_score(y_true, y_pred, labels=labels, average="weighted", zero_division=0), 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=None)
    args = parser.parse_args()
    cfg = load_config(args.config)
    set_seed(cfg["seed"])

    samples = read_jsonl(PROJECT_ROOT / cfg["data"]["processed_dir"] / "dailydialog_erc.jsonl")
    labels = list(cfg["emotion_labels"].values())
    train = [s for s in samples if s["split"] == "train"]
    test = [s for s in samples if s["split"] == "test"]
    y_train = [s["label"] for s in train]
    y_test = [s["label"] for s in test]

    results = {}

    # E0 多数类
    majority = Counter(y_train).most_common(1)[0][0]
    y_pred = [majority] * len(y_test)
    results["E0_majority"] = {"input": "无", **evaluate(y_test, y_pred, labels)}

    # TF-IDF + LR 系列
    modes = {"E1_tfidf_current": ("current", None),
             "E1b_tfidf_ctx_only": ("ctx_only", None),
             "E1w_tfidf_current_bal": ("current", "balanced"),
             "E2_tfidf_ctx1": ("ctx1", None),
             "E3_tfidf_ctx3": ("ctx3", None)}
    models = {}
    for name, (mode, cw) in modes.items():
        vec = TfidfVectorizer(ngram_range=tuple(cfg["tfidf"]["ngram_range"]),
                              min_df=cfg["tfidf"]["min_df"],
                              max_features=cfg["tfidf"]["max_features"])
        X_train = vec.fit_transform([build_text(s, mode) for s in train])
        X_test = vec.transform([build_text(s, mode) for s in test])
        clf = LogisticRegression(max_iter=cfg["logreg"]["max_iter"],
                                 C=cfg["logreg"]["C"], class_weight=cw,
                                 random_state=cfg["seed"])
        clf.fit(X_train, y_train)
        y_pred = clf.predict(X_test)
        results[name] = {"input": mode, "class_weight": cw or "none",
                         **evaluate(y_test, y_pred, labels)}
        models[name] = (vec, clf, mode)
        print(f"{name}: {results[name]}")

    # 选 Macro-F1 最高的模型做预测与混淆矩阵
    best = max((k for k in results if k != "E0_majority"),
               key=lambda k: results[k]["macro_f1"])
    vec, clf, mode = models[best]
    X_test = vec.transform([build_text(s, mode) for s in test])
    proba = clf.predict_proba(X_test)
    classes = list(clf.classes_)
    y_pred = clf.predict(X_test)

    # 持久化最佳模型，供分析服务（server/app.py）加载
    ckpt = PROJECT_ROOT / "outputs" / "checkpoints" / "erc_best_model.joblib"
    ckpt.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"vectorizer": vec, "clf": clf, "mode": mode, "classes": classes}, ckpt)

    report = classification_report(y_test, y_pred, labels=labels, zero_division=0)
    (PROJECT_ROOT / "outputs" / "metrics" / f"erc_report_{best}.txt").write_text(
        report, encoding="utf-8")
    results["_best_model"] = best

    # 混淆矩阵
    cm = confusion_matrix(y_test, y_pred, labels=labels)
    fig, ax = plt.subplots(figsize=(7, 6))
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(labels)), labels, rotation=30, ha="right")
    ax.set_yticks(range(len(labels)), labels)
    ax.set_xlabel("predicted")
    ax.set_ylabel("gold")
    ax.set_title(f"Confusion matrix ({best})")
    for i in range(len(labels)):
        for j in range(len(labels)):
            if cm[i, j] > 0:
                ax.text(j, i, cm[i, j], ha="center", va="center", fontsize=7,
                        color="white" if cm[i, j] > cm.max() / 2 else "black")
    fig.colorbar(im)
    fig.tight_layout()
    fig.savefig(PROJECT_ROOT / "outputs" / "figures" / "confusion_matrix.png", dpi=150)
    plt.close(fig)

    # 逐轮预测概率
    preds = []
    for s, probs, pred in zip(test, proba, y_pred):
        preds.append({
            "conversation_id": s["conversation_id"],
            "turn_id": s["turn_id"],
            "speaker": s["speaker"],
            "text": s["text"],
            "gold_emotion": s["label"],
            "predicted_emotion": pred,
            "confidence": round(float(probs.max()), 4),
            "probabilities": {c: round(float(p), 4) for c, p in zip(classes, probs)},
            "correct": bool(pred == s["label"]),
        })
    write_jsonl(PROJECT_ROOT / "outputs" / "predictions" / "erc_test_predictions.jsonl", preds)

    out = PROJECT_ROOT / "outputs" / "metrics" / "erc_results.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nbest model: {best}")
    print(f"predictions: {len(preds)} turns -> outputs/predictions/erc_test_predictions.jsonl")


if __name__ == "__main__":
    main()
