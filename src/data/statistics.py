"""数据统计：分布、长度、缺失值、类别不均衡，输出 stats.json + 4 张图。"""
import argparse
import json
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from src.utils.common import PROJECT_ROOT, load_config, read_jsonl

FIG_DIR = PROJECT_ROOT / "outputs" / "figures"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=None)
    args = parser.parse_args()
    cfg = load_config(args.config)

    convs = read_jsonl(PROJECT_ROOT / cfg["data"]["processed_dir"] / "dailydialog_normalized.jsonl")
    FIG_DIR.mkdir(parents=True, exist_ok=True)

    stats = {"splits": {}, "overall": {}}
    label_order = list(cfg["emotion_labels"].values())
    split_label_counts: dict[str, Counter] = {}

    for split in ["train", "validation", "test"]:
        subset = [c for c in convs if c["split"] == split]
        n_turns = [len(c["turns"]) for c in subset]
        emo_counter = Counter()
        spk_counter = Counter()
        utt_lens = []
        n_missing = 0
        texts = []
        for c in subset:
            for t in c["turns"]:
                texts.append(t["text"])
                utt_lens.append(len(t["text"].split()))
                spk_counter[t["speaker"]] += 1
                if t["emotion"] is None:
                    n_missing += 1
                else:
                    emo_counter[t["emotion"]] += 1
        dup_ratio = 1 - len(set(texts)) / max(len(texts), 1)
        stats["splits"][split] = {
            "conversations": len(subset),
            "utterances": len(texts),
            "avg_turns": round(sum(n_turns) / max(len(n_turns), 1), 2),
            "min_turns": min(n_turns), "max_turns": max(n_turns),
            "emotion_counts": dict(emo_counter),
            "speaker_counts": dict(spk_counter),
            "missing_emotion": n_missing,
            "duplicate_text_ratio": round(dup_ratio, 4),
            "utt_len_min": min(utt_lens), "utt_len_max": max(utt_lens),
            "utt_len_avg": round(sum(utt_lens) / max(len(utt_lens), 1), 2),
        }
        split_label_counts[split] = emo_counter

    # ---------- 图 1：情绪类别分布（train） ----------
    train_counts = split_label_counts["train"]
    fig, ax = plt.subplots(figsize=(8, 4.5))
    vals = [train_counts.get(l, 0) for l in label_order]
    ax.bar(label_order, vals, color="#9BBBF4")
    for i, v in enumerate(vals):
        ax.text(i, v, str(v), ha="center", va="bottom", fontsize=8)
    ax.set_title("Emotion label distribution (train)")
    ax.set_ylabel("count")
    plt.xticks(rotation=20)
    fig.tight_layout()
    fig.savefig(FIG_DIR / "emotion_distribution.png", dpi=150)
    plt.close(fig)

    # ---------- 图 2：对话轮数分布 ----------
    fig, ax = plt.subplots(figsize=(8, 4.5))
    all_turns = [len(c["turns"]) for c in convs]
    ax.hist(all_turns, bins=range(min(all_turns), max(all_turns) + 2), color="#A3D5E8", edgecolor="white")
    ax.set_title("Dialogue length (turns) distribution")
    ax.set_xlabel("turns per dialogue")
    ax.set_ylabel("count")
    fig.tight_layout()
    fig.savefig(FIG_DIR / "dialog_length_hist.png", dpi=150)
    plt.close(fig)

    # ---------- 图 3：utterance 长度分布 ----------
    fig, ax = plt.subplots(figsize=(8, 4.5))
    all_lens = [len(t["text"].split()) for c in convs for t in c["turns"]]
    ax.hist(all_lens, bins=50, color="#F4C790", edgecolor="white")
    ax.set_title("Utterance length (words) distribution")
    ax.set_xlabel("words per utterance")
    ax.set_ylabel("count")
    fig.tight_layout()
    fig.savefig(FIG_DIR / "utterance_length_hist.png", dpi=150)
    plt.close(fig)

    # ---------- 图 4：各 split 类别比例对比 ----------
    fig, ax = plt.subplots(figsize=(9, 4.5))
    width = 0.25
    splits = ["train", "validation", "test"]
    for si, split in enumerate(splits):
        total = sum(split_label_counts[split].values())
        props = [split_label_counts[split].get(l, 0) / total for l in label_order]
        ax.bar([i + si * width for i in range(len(label_order))], props, width=width, label=split)
    ax.set_xticks([i + width for i in range(len(label_order))])
    ax.set_xticklabels(label_order, rotation=20)
    ax.set_ylabel("proportion")
    ax.set_title("Emotion proportion by split")
    ax.legend()
    fig.tight_layout()
    fig.savefig(FIG_DIR / "split_class_proportion.png", dpi=150)
    plt.close(fig)

    # 类别不均衡程度：多数类占比
    train_total = sum(train_counts.values())
    majority = max(train_counts.values())
    stats["overall"]["majority_class"] = max(train_counts, key=train_counts.get)
    stats["overall"]["majority_ratio_train"] = round(majority / train_total, 4)

    out = PROJECT_ROOT / "outputs" / "metrics" / "data_stats.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(stats["splits"], ensure_ascii=False, indent=2))
    print("majority class:", stats["overall"]["majority_class"],
          "ratio:", stats["overall"]["majority_ratio_train"])
    print(f"figures -> {FIG_DIR}")


if __name__ == "__main__":
    main()
