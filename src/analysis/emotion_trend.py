"""情绪趋势分析：时序指标函数 + 逐对话趋势图。

时序三个基础指标（来自 W2 预研要求）：
  1. polarity_flips       情绪极性翻转次数（正负号变化）
  2. max_negative_streak  最大连续负向情绪轮数
  3. volatility           情绪波动幅度（情绪分数标准差）
另加：negative_prob 线性斜率（负向情绪概率是否在上升）。

注意：trend_score 映射仅用于可视化，不是心理学意义上的情绪强度。
"""
import argparse
import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from src.utils.common import PROJECT_ROOT, load_config, read_jsonl

TREND_DIR = PROJECT_ROOT / "outputs" / "figures" / "conversation_trends"


def neg_prob(probs: dict, negative_emotions: list[str]) -> float:
    return sum(probs.get(e, 0.0) for e in negative_emotions)


def entropy(probs: dict) -> float:
    return -sum(p * math.log(p) for p in probs.values() if p > 0)


def temporal_metrics(turns: list[dict], score_map: dict, negative_emotions: list[str]) -> dict:
    """对一段对话的预测序列计算时序指标。turns 按 turn_id 排序。"""
    scores, negs, flips = [], [], 0
    streak = max_streak = 0
    prev_sign = 0
    for t in turns:
        s = score_map.get(t["predicted_emotion"], 0.0)
        npb = neg_prob(t["probabilities"], negative_emotions)
        scores.append(s)
        negs.append(npb)
        sign = 1 if s > 0 else (-1 if s < 0 else 0)
        if sign != 0 and prev_sign != 0 and sign != prev_sign:
            flips += 1
        if sign != 0:
            prev_sign = sign
        if npb >= 0.5:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0
    slope = float(np.polyfit(range(len(negs)), negs, 1)[0]) if len(negs) >= 2 else 0.0
    return {
        "polarity_flips": flips,
        "max_negative_streak": max_streak,
        "volatility": round(float(np.std(scores)), 4) if scores else 0.0,
        "negative_prob_slope": round(slope, 4),
    }


def plot_conversation(conv_id: str, turns: list[dict], score_map: dict,
                      negative_emotions: list[str], low_conf: float, out_dir: Path) -> None:
    xs = [t["turn_id"] for t in turns]
    scores = [score_map.get(t["predicted_emotion"], 0.0) for t in turns]
    negs = [neg_prob(t["probabilities"], negative_emotions) for t in turns]
    confs = [t["confidence"] for t in turns]
    speakers = [t["speaker"] for t in turns]

    fig, ax1 = plt.subplots(figsize=(10, 4.8))
    colors = ["#E8833A" if sp == "A" else "#4A7FB5" for sp in speakers]
    ax1.step(xs, scores, where="mid", color="#888", alpha=0.5)
    ax1.scatter(xs, scores, c=colors, zorder=3, s=45)
    for x, s, t in zip(xs, scores, turns):
        ax1.annotate(t["predicted_emotion"], (x, s), textcoords="offset points",
                     xytext=(0, 8), fontsize=7, ha="center")
    ax1.set_ylabel("emotion score (display only)")
    ax1.set_xlabel("turn_id")
    ax1.set_ylim(-1.1, 1.3)

    ax2 = ax1.twinx()
    ax2.plot(xs, negs, color="#D9544D", marker=".", alpha=0.85, label="negative prob")
    ax2.set_ylabel("negative emotion probability", color="#D9544D")
    ax2.set_ylim(0, 1.05)
    ax2.tick_params(axis="y", labelcolor="#D9544D")

    # 标注低置信度轮次
    for x, c in zip(xs, confs):
        if c < low_conf:
            ax1.axvline(x, color="#F4C790", alpha=0.6, linewidth=6, zorder=0)

    ax1.set_title(f"{conv_id}  (orange/blue = speaker A/B, shaded = low confidence)")
    fig.tight_layout()
    fig.savefig(out_dir / f"{conv_id}.png", dpi=140)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=None)
    args = parser.parse_args()
    cfg = load_config(args.config)
    score_map = cfg["trend_score"]
    neg_emos = cfg["negative_emotions"]
    low_conf = cfg["trend_figures"]["low_confidence_threshold"]
    n_figs = cfg["trend_figures"]["num_conversations"]

    preds = read_jsonl(PROJECT_ROOT / "outputs" / "predictions" / "erc_test_predictions.jsonl")
    convs: dict[str, list[dict]] = {}
    for p in preds:
        convs.setdefault(p["conversation_id"], []).append(p)
    for v in convs.values():
        v.sort(key=lambda t: t["turn_id"])

    # 全部对话的时序指标
    all_metrics = {}
    for cid, turns in convs.items():
        all_metrics[cid] = temporal_metrics(turns, score_map, neg_emos)
    out = PROJECT_ROOT / "outputs" / "metrics" / "temporal_metrics.json"
    out.write_text(json.dumps(all_metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    # 挑"最有动态"的对话画图：波动幅度 + 负向斜率综合靠前，且轮数 >= 6
    ranked = sorted(
        (c for c in convs.items() if len(c[1]) >= 6),
        key=lambda kv: all_metrics[kv[0]]["volatility"] + abs(all_metrics[kv[0]]["negative_prob_slope"]),
        reverse=True,
    )
    TREND_DIR.mkdir(parents=True, exist_ok=True)
    for cid, turns in ranked[:n_figs]:
        plot_conversation(cid, turns, score_map, neg_emos, low_conf, TREND_DIR)

    print(f"conversations analyzed: {len(convs)}")
    print(f"trend figures saved: {min(n_figs, len(ranked))} -> {TREND_DIR}")
    sample = ranked[0][0]
    print("example:", sample, all_metrics[sample])


if __name__ == "__main__":
    main()
