"""中文情绪数据预处理：微博情绪数据 → 项目统一 JSONL。

数据源：souljoy/COVID-19_weibo_emotion（HF，经 hf-mirror 下载）
标签映射到项目 7 类体系：
  neutral→no_emotion, happy→happiness, angry→anger,
  sad→sadness, fear→fear, surprise→surprise
  disgust：该数据集没有，明确标注为"不支持"，不造假。

注意（如实记录）：
- 该数据是疫情相关微博单帖，不是对话数据，域差异存在；
- 用于训练中文单轮情绪分类器，对话语境适应性需在 W4 用真实对话验证。
"""
import argparse

import pandas as pd

from src.utils.common import PROJECT_ROOT, load_config, set_seed, write_jsonl

LABEL_MAP = {
    "neutral": "no_emotion",
    "happy": "happiness",
    "angry": "anger",
    "sad": "sadness",
    "fear": "fear",
    "surprise": "surprise",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=None)
    args = parser.parse_args()
    cfg = load_config(args.config)
    set_seed(cfg["seed"])

    raw_dir = PROJECT_ROOT / cfg["data"]["raw_dir"]
    out_dir = PROJECT_ROOT / cfg["data"]["processed_dir"]
    out_dir.mkdir(parents=True, exist_ok=True)

    records = []
    for split in ["train", "validation", "test"]:
        df = pd.read_csv(raw_dir / f"weibo_emotion_{split}.csv")
        for i, row in enumerate(df.itertuples(index=False)):
            records.append({
                "conversation_id": None,  # 单帖数据，无对话结构
                "turn_id": 0,
                "speaker": None,
                "context": [],
                "text": str(row.text).strip(),
                "label": LABEL_MAP[str(row.label_name)],
                "split": split,
                "source": "weibo_emotion",
            })
        print(f"[{split}] {len(df)} samples")

    write_jsonl(out_dir / "weibo_erc_zh.jsonl", records)
    print(f"total={len(records)} -> {out_dir / 'weibo_erc_zh.jsonl'}")
    print("label map:", LABEL_MAP, "| disgust: 数据不支持")


if __name__ == "__main__":
    main()
