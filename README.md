# 时序感知高情商聊天助手（Temporal-aware EQ Chat Assistant）

输入一段多轮聊天记录 → 逐轮情绪识别（ERC）→ 情绪时间线与趋势 → 冲突风险提示 → （接入 LLM 后）局势分析 / 沟通建议 / 高情商回复草稿。

**架构**：感知层（本地情绪识别模型）→ 生成层（LLM，API 可插拔，支持 Kimi / DeepSeek / OpenAI 兼容接口）→ 网站前端（React）。

## 快速开始

```bash
# 1. 安装 Python 依赖（建议 Python 3.10+ 虚拟环境）
pip install -r requirements.txt

# 2. 下载数据集与中文预训练模型（仓库不含大文件，必做）
python scripts/download_assets.py

# 3. 安装前端依赖（需要 Node.js 20+）
cd web && npm install && cd ..
```

## 复现实验（W1–W2 基线）

```bash
export PYTHONPATH=.
python -m src.data.preprocess        # DailyDialog parquet -> 统一 JSONL
python -m src.data.statistics        # 数据统计 + 4 张分布图
python -m src.models.baseline        # 6 组基线实验 + 混淆矩阵 + 逐轮概率（同时保存最佳模型）
python -m src.analysis.emotion_trend # 时序指标 + 12 张趋势图
python -m src.analysis.conflict_heuristic  # 冲突预警启发式（未验证占位规则）
```

## 启动网站

```bash
# 终端 1：分析后端
PYTHONPATH=. uvicorn server.app:app --port 8000

# 终端 2：前端（默认 http://localhost:3000，已配置 /api 代理到 8000）
cd web && npm run dev
```

后端未启动时前端自动进入演示模式（有明确提示）。

## 接入大模型（建议/回复生成层）

两选一：

- 网页右上角「⚙ 大模型设置」填入 API Key（仅存浏览器本地，随请求转发）；
- 或 `cp configs/llm.example.yaml configs/llm.yaml` 后填入 Key（`llm.yaml` 已被 gitignore）。

未接入时建议面板显示占位说明，**不会用模板话术冒充 AI 建议**。

## 中文情绪识别（W3）

```bash
PYTHONPATH=. python -m src.data.prepare_zh            # 微博数据 -> 统一 JSONL
PYTHONPATH=. python -m src.models.train_erc_zh --smoke    # 冒烟测试（800 条 1 epoch）
PYTHONPATH=. python -m src.models.train_erc_zh --epochs 3 # 正式训练（约 15–20 分钟）
```

注意：中文训练数据为微博单帖（非对话），且不含 disgust 类——局限详见 `docs/dataset.md`。

## 目录结构

```
configs/            全部超参、标签映射、LLM 配置模板
scripts/            download_assets.py（一键下载数据+模型）
src/                预处理 / 统计 / 基线 / 中文模型 / 趋势 / 预警
server/             FastAPI 分析服务（分析接口 + LLM 代理）
web/                React + Vite + Tailwind + shadcn/ui 前端
docs/               范围定义、数据集文档、实验记录、错误分析、W3-W4 计划、改进点子
data/ models/ outputs/  （gitignore，由脚本生成）
```

## 关键实验结论（详见 docs/experiment_log.md）

- 主指标 Macro-F1：最佳基线 **0.3921**（TF-IDF+LR, class_weight=balanced, DailyDialog test）
- 多数类基线 Accuracy 即达 0.8167（多数类占 82.76%）——只看 Accuracy 会严重高估模型
- 朴素拼接上下文使 Macro-F1 下降（0.39→0.21），上下文建模需要专用 ERC 架构
- 冲突预警当前为**未经验证的启发式占位规则**，阈值待 W4 基于人工标注校准

## 数据与引用

- DailyDialog: Li et al., *DailyDialog: A Manually Labelled Multi-turn Dialogue Dataset*, IJCNLP 2017（经 HuggingFace `daily_dialog` 获取）
- COVID-19 微博情绪数据：HuggingFace `souljoy/COVID-19_weibo_emotion`
- 中文预训练模型：`hfl/chinese-roberta-wwm-ext`（Cui et al.）

使用上述数据请遵循各自的许可并引用原始出处。
