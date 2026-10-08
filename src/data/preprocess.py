"""DailyDialog 预处理：parquet → 统一 JSONL。

产出两个文件：
1. dailydialog_normalized.jsonl —— 对话级，保留全部字段，可追溯；
2. dailydialog_erc.jsonl —— 样本级（每行一个 utterance），供 ERC 训练/推理。

划分沿用 DailyDialog 官方 train/validation/test，不重新随机划分，
以保证结果与已有文献可比，且同一对话不会跨划分泄漏。
"""
import argparse
from pathlib import Path

import pandas as pd

from src.utils.common import PROJECT_ROOT, load_config, set_seed, write_jsonl


def normalize_split(df: pd.DataFrame, split: str, emotion_map: dict) -> list[dict]:
    conversations = []
    for i, row in enumerate(df.itertuples(index=False)):
        conv_id = f"dd_{split}_{i:05d}"
        turns = []
        for t, text in enumerate(row.dialog):
            emo_id = int(row.emotion[t]) if t < len(row.emotion) else None
            turns.append({
                "turn_id": t,
                # DailyDialog 为二人对话，说话人按轮次交替，原始数据无显式 speaker 字段
                "speaker": "A" if t % 2 == 0 else "B",
                "text": text.strip(),
                "emotion": emotion_map.get(emo_id) if emo_id is not None else None,
                "act": int(row.act[t]) if t < len(row.act) else None,
            })
        conversations.append({
            "conversation_id": conv_id,
            "turns": turns,
            "source": "dailydialog",
            "split": split,
        })
    return conversations


def to_erc_samples(conversations: list[dict]) -> list[dict]:
    samples = []
    for conv in conversations:
        ctx = []
        for turn in conv["turns"]:
            samples.append({
                "conversation_id": conv["conversation_id"],
                "turn_id": turn["turn_id"],
                "speaker": turn["speaker"],
                "context": list(ctx),  # 此前所有轮次的文本（不含当前轮）
                "text": turn["text"],
                "label": turn["emotion"],
                "split": conv["split"],
            })
            ctx.append(turn["text"])
    return samples


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=None)
    args = parser.parse_args()

    cfg = load_config(args.config)
    set_seed(cfg["seed"])
    emotion_map = {int(k): v for k, v in cfg["emotion_labels"].items()}

    raw_dir = PROJECT_ROOT / cfg["data"]["raw_dir"]
    out_dir = PROJECT_ROOT / cfg["data"]["processed_dir"]
    out_dir.mkdir(parents=True, exist_ok=True)

    all_conv, all_erc = [], []
    for split, fname in [("train", "dailydialog_train.parquet"),
                         ("validation", "dailydialog_validation.parquet"),
                         ("test", "dailydialog_test.parquet")]:
        df = pd.read_parquet(raw_dir / fname)
        convs = normalize_split(df, split, emotion_map)
        erc = to_erc_samples(convs)
        all_conv.extend(convs)
        all_erc.extend(erc)
        n_utt = sum(len(c["turns"]) for c in convs)
        print(f"[{split}] conversations={len(convs)}  utterances={n_utt}")

    write_jsonl(out_dir / "dailydialog_normalized.jsonl", all_conv)
    write_jsonl(out_dir / "dailydialog_erc.jsonl", all_erc)
    print(f"total conversations={len(all_conv)}  total erc samples={len(all_erc)}")
    print(f"written to {out_dir}")


if __name__ == "__main__":
    main()
