"""冲突预警启发式原型（未验证）。

⚠️ 重要声明：本模块输出的是**未经人工标注验证的启发式结果**。
- "conflict_risk" 不代表真实冲突程度，只是基于情绪序列规则的提示信号；
- 阈值（streak>=3、slope>0.05、flips>=2）是占位值，需在 W3 拿到足够多
  真实序列后，依据分布与人工标注重新校准；
- 不许把这些输出当作论文/报告中的"冲突检测准确率"证据。

规则（v0.1，占位）：
  high   : max_negative_streak >= 3 且 negative_prob_slope > 0
  medium : negative_prob_slope > 0.05 或 polarity_flips >= 2 或 max_negative_streak >= 2
  low    : 其他
"""
import argparse
import json
from pathlib import Path

from src.utils.common import PROJECT_ROOT, load_config, write_jsonl

DISCLAIMER = ("heuristic_unverified: rules & thresholds are placeholders, "
              "not validated against human-labeled conflict data")


def assess(m: dict) -> dict:
    reasons = []
    if m["max_negative_streak"] >= 3 and m["negative_prob_slope"] > 0:
        risk = "high"
        reasons.append("negative_emotion_streak>=3_and_rising")
    elif (m["negative_prob_slope"] > 0.05 or m["polarity_flips"] >= 2
          or m["max_negative_streak"] >= 2):
        risk = "medium"
        if m["negative_prob_slope"] > 0.05:
            reasons.append("negative_emotion_increase")
        if m["polarity_flips"] >= 2:
            reasons.append("rapid_emotion_change")
        if m["max_negative_streak"] >= 2:
            reasons.append("negative_emotion_streak>=2")
    else:
        risk = "low"
        reasons.append("no_strong_signal")
    trend = ("worsening" if m["negative_prob_slope"] > 0.05
             else "improving" if m["negative_prob_slope"] < -0.05 else "stable")
    return {"trend": trend, "conflict_risk": risk, "reason_codes": reasons,
            "note": DISCLAIMER}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=None)
    args = parser.parse_args()
    load_config(args.config)  # 保留配置入口，阈值后续移入配置

    # temporal_metrics.json 是 dict，直接 json load
    metrics = json.loads(
        (PROJECT_ROOT / "outputs" / "metrics" / "temporal_metrics.json").read_text(encoding="utf-8"))

    out_records = []
    dist = {"low": 0, "medium": 0, "high": 0}
    for cid, m in metrics.items():
        r = assess(m)
        dist[r["conflict_risk"]] += 1
        out_records.append({"conversation_id": cid, **r})

    write_jsonl(PROJECT_ROOT / "outputs" / "predictions" / "conflict_risk_predictions.jsonl",
                out_records)
    print("risk distribution:", dist)
    print("-> outputs/predictions/conflict_risk_predictions.jsonl")


if __name__ == "__main__":
    main()
