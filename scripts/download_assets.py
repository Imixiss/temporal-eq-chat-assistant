"""一键下载项目所需的外部资产（数据集 + 中文预训练模型）。

GitHub 仓库不含大文件，克隆后先运行本脚本：

    pip install -r requirements.txt
    python scripts/download_assets.py

下载内容（均来自 HuggingFace 镜像 hf-mirror，海外网络可把 HF_MIRROR 改为 https://huggingface.co）：
  1. DailyDialog parquet × 3      -> data/raw/
  2. 微博情绪数据 csv × 3          -> data/raw/
  3. hfl/chinese-roberta-wwm-ext  -> models/zh-roberta-wwm-ext/（约 411MB）

下载完成后按 README 的"复现实验"一节依次运行预处理脚本。
"""
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIRROR = os.environ.get("HF_MIRROR", "https://hf-mirror.com")

FILES = {
    # DailyDialog（官方 parquet 转换）
    "data/raw/dailydialog_train.parquet":
        "/datasets/daily_dialog/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet",
    "data/raw/dailydialog_validation.parquet":
        "/datasets/daily_dialog/resolve/refs%2Fconvert%2Fparquet/default/validation/0000.parquet",
    "data/raw/dailydialog_test.parquet":
        "/datasets/daily_dialog/resolve/refs%2Fconvert%2Fparquet/default/test/0000.parquet",
    # COVID-19 微博情绪数据
    "data/raw/weibo_emotion_train.csv":
        "/datasets/souljoy/COVID-19_weibo_emotion/resolve/main/train.csv",
    "data/raw/weibo_emotion_validation.csv":
        "/datasets/souljoy/COVID-19_weibo_emotion/resolve/main/validation.csv",
    "data/raw/weibo_emotion_test.csv":
        "/datasets/souljoy/COVID-19_weibo_emotion/resolve/main/test.csv",
}


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"skip (exists): {dest.name}")
        return
    print(f"downloading: {dest.name} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())
    print(f"  -> {dest} ({dest.stat().st_size / 1e6:.1f} MB)")


def main() -> None:
    for rel, path in FILES.items():
        download(MIRROR + path, ROOT / rel)

    print("\ndownloading hfl/chinese-roberta-wwm-ext (~411MB) ...")
    os.environ["HF_ENDPOINT"] = MIRROR
    os.environ["HF_HUB_DISABLE_XET"] = "1"  # 镜像站不支持 xet 协议
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        sys.exit("请先 pip install huggingface_hub（或 pip install -r requirements.txt）")
    p = snapshot_download("hfl/chinese-roberta-wwm-ext",
                          local_dir=str(ROOT / "models" / "zh-roberta-wwm-ext"))
    print(f"  -> {p}")
    print("\n全部完成。下一步见 README「复现实验」。")


if __name__ == "__main__":
    main()
