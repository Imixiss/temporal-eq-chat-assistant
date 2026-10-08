"""中文 ERC 微调：chinese-roberta-wwm-ext + 分类头，微博情绪数据。

用法：
  # 冒烟测试（验证流程，800 条 1 个 epoch）
  PYTHONPATH=. python -m src.models.train_erc_zh --smoke
  # 正式训练（W3-D3 任务）
  PYTHONPATH=. python -m src.models.train_erc_zh --epochs 3

输出：outputs/checkpoints/erc_zh/（模型+tokenizer+标签映射）
      outputs/metrics/erc_zh_results.json
"""
import argparse
import json
import time

import numpy as np
import torch
from sklearn.metrics import accuracy_score, classification_report, f1_score
from torch.utils.data import DataLoader, Dataset
from transformers import (AutoModelForSequenceClassification, AutoTokenizer,
                          get_linear_schedule_with_warmup)

from src.utils.common import PROJECT_ROOT, load_config, read_jsonl, set_seed

MODEL_DIR = PROJECT_ROOT / "models" / "zh-roberta-wwm-ext"
OUT_DIR = PROJECT_ROOT / "outputs" / "checkpoints" / "erc_zh"

LABELS = ["no_emotion", "anger", "fear", "happiness", "sadness", "surprise"]  # disgust 数据不支持
LABEL2ID = {l: i for i, l in enumerate(LABELS)}


class EmotionDataset(Dataset):
    def __init__(self, samples, tokenizer, max_len=128):
        self.samples = samples
        self.tok = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        s = self.samples[idx]
        enc = self.tok(s["text"], truncation=True, max_length=self.max_len,
                       padding="max_length", return_tensors="pt")
        return {
            "input_ids": enc["input_ids"].squeeze(0),
            "attention_mask": enc["attention_mask"].squeeze(0),
            "labels": torch.tensor(LABEL2ID[s["label"]], dtype=torch.long),
        }


def evaluate(model, loader, device):
    model.eval()
    preds, golds = [], []
    with torch.no_grad():
        for batch in loader:
            batch = {k: v.to(device) for k, v in batch.items()}
            logits = model(**batch).logits
            preds.extend(logits.argmax(-1).cpu().tolist())
            golds.extend(batch["labels"].cpu().tolist())
    return {
        "accuracy": round(accuracy_score(golds, preds), 4),
        "macro_f1": round(f1_score(golds, preds, average="macro", zero_division=0), 4),
        "weighted_f1": round(f1_score(golds, preds, average="weighted", zero_division=0), 4),
    }, preds, golds


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=None)
    parser.add_argument("--smoke", action="store_true", help="冒烟测试：800 条 1 epoch")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    args = parser.parse_args()

    cfg = load_config(args.config)
    set_seed(cfg["seed"])
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"device: {device}")

    samples = read_jsonl(PROJECT_ROOT / cfg["data"]["processed_dir"] / "weibo_erc_zh.jsonl")
    train = [s for s in samples if s["split"] == "train"]
    test = [s for s in samples if s["split"] == "test"]
    if args.smoke:
        train, test = train[:800], test[:200]
        args.epochs = 1
        print(f"SMOKE mode: train={len(train)} test={len(test)}")

    tok = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_DIR, num_labels=len(LABELS)).to(device)

    train_loader = DataLoader(EmotionDataset(train, tok), batch_size=args.batch_size, shuffle=True)
    test_loader = DataLoader(EmotionDataset(test, tok), batch_size=32)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    total_steps = len(train_loader) * args.epochs
    scheduler = get_linear_schedule_with_warmup(optimizer, int(total_steps * 0.1), total_steps)

    t0 = time.time()
    for ep in range(args.epochs):
        model.train()
        losses = []
        for step, batch in enumerate(train_loader):
            batch = {k: v.to(device) for k, v in batch.items()}
            out = model(**batch)
            out.loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()
            losses.append(out.loss.item())
            if (step + 1) % 20 == 0:
                print(f"epoch {ep+1} step {step+1}/{len(train_loader)} "
                      f"loss={np.mean(losses[-20:]):.4f}")
        print(f"== epoch {ep+1} done, mean loss={np.mean(losses):.4f}, "
              f"elapsed={time.time()-t0:.0f}s")

    metrics, preds, golds = evaluate(model, test_loader, device)
    print("test metrics:", metrics)
    report = classification_report(golds, preds, target_names=LABELS, zero_division=0)
    print(report)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(OUT_DIR)
    tok.save_pretrained(OUT_DIR)
    (OUT_DIR / "label_map.json").write_text(
        json.dumps({"labels": LABELS, "label2id": LABEL2ID}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    result = {"mode": "smoke" if args.smoke else "full",
              "train_samples": len(train), "test_samples": len(test),
              "epochs": args.epochs, **metrics,
              "train_seconds": round(time.time() - t0, 1)}
    out = PROJECT_ROOT / "outputs" / "metrics" / "erc_zh_results.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    (PROJECT_ROOT / "outputs" / "metrics" / "erc_zh_report.txt").write_text(report, encoding="utf-8")
    print(f"model -> {OUT_DIR}\nmetrics -> {out}")


if __name__ == "__main__":
    main()
