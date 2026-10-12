# 时序感知高情商聊天助手（Temporal-aware EQ Chat Assistant）

> 别的工具只看对方最后一句话；这个工具看**整段对话的情绪走向**，再告诉你该怎么回。

粘贴一段微信 / QQ 聊天记录（或直接上传截图），它会逐轮识别情绪、画出情绪时间线、提示冲突风险信号，最后由大模型给出局势分析和 2–3 条可以直接发送的回复草稿。

![分析结果页](docs/screenshots/result-top.jpg)

## 为什么不一样

- **时序视角，不是单句话术**：情绪翻转点、连续负向区间、恶化/好转趋势一目了然——争吵往往发生在"趋势"里，而不是某一句话里
- **端到端真的能跑**：粘贴 → 本地情绪模型 → 趋势图 → 大模型建议，一条链路全部本地启动，不依赖任何云端服务部署
- **隐私与成本是设计出来的**：聊天文本只在你电脑上分析；截图识别用 macOS 系统离线能力，图片不出本机；大模型调用带用量账本和预算熔断，花超了自动停
- **实验记录诚实地写局限**：反讽会误判、冲突预警是未校准的启发式、中文模型训练数据是微博单帖——都写在 `docs/experiment_log.md`，不藏着

<details>
<summary>📸 完整结果页长截图（含回复草稿）</summary>

![完整结果页](docs/screenshots/result-full.jpg)

</details>

## 30 秒跑起来

```bash
# 1. Python 依赖（建议 3.10+ 虚拟环境）
pip install -r requirements.txt

# 2. 下载数据集与模型（仓库不含大文件，必做）
python scripts/download_assets.py

# 3. 前端依赖（Node.js 20+）
cd web && npm install && cd ..

# 4. 启动（两个终端）
PYTHONPATH=. uvicorn server.app:app --port 8000   # 后端
cd web && npm run dev                             # 前端 http://localhost:3000
```

打开网页 → 点「载入示例」→「开始分析」。不接大模型也能看到情绪识别和趋势图；接入后才有建议与回复草稿（见下文）。

## 输入方式

- **直接粘贴**：支持微信/QQ 复制出来的「昵称 + 时间戳」格式（自动识别双方昵称，多行消息自动合并）
- **上传截图**：📷 按钮上传聊天截图，调用 macOS Vision 框架在**本机离线**识别文字（图片不出本机；仅 macOS 可用，识别结果先填入输入框由你确认再分析）
- **手动格式**：`A: 消息` / `B：消息`，不带前缀则按 A/B 交替

## 接入大模型（建议/回复生成层）

两选一：

- 网页右上角「⚙ 大模型设置」填入 API Key（仅存浏览器本地，随请求转发）；
- 或 `cp configs/llm.example.yaml configs/llm.yaml` 后填入 Key（`llm.yaml` 已被 gitignore）。

默认模型 `kimi-k2.6`，兼容任何 OpenAI 格式接口（Kimi / DeepSeek / OpenAI / 自定义）。
未接入时建议面板显示占位说明，**不会用模板话术冒充 AI 建议**。

## 架构

感知层（本地情绪识别模型，中英自动路由）→ 生成层（LLM，API 可插拔）→ 网站前端（React + Vite + Tailwind + shadcn/ui）。

## 复现实验（W1–W2 基线）

```bash
export PYTHONPATH=.
python -m src.data.preprocess        # DailyDialog parquet -> 统一 JSONL
python -m src.data.statistics        # 数据统计 + 4 张分布图
python -m src.models.baseline        # 6 组基线实验 + 混淆矩阵 + 逐轮概率（同时保存最佳模型）
python -m src.analysis.emotion_trend # 时序指标 + 12 张趋势图
python -m src.analysis.conflict_heuristic  # 冲突预警启发式（未验证占位规则）
```

## 中文情绪识别（W3）

```bash
PYTHONPATH=. python -m src.data.prepare_zh            # 微博数据 -> 统一 JSONL
PYTHONPATH=. python -m src.models.train_erc_zh --smoke    # 冒烟测试（800 条 1 epoch）
PYTHONPATH=. python -m src.models.train_erc_zh --epochs 3 # 正式训练（约 15–20 分钟）
```

注意：中文训练数据为微博单帖（非对话），且不含 disgust 类——局限详见 `docs/dataset.md`。
已训练完成的指标与跨域局限（含反讽误判案例）见 `docs/experiment_log.md` 的 W3 记录。
后端 `/api/analyze` 会按语言自动路由：中文走 RoBERTa，英文走 TF-IDF 基线。

## 目录结构

```
configs/            全部超参、标签映射、LLM 配置模板
scripts/            download_assets.py（一键下载数据+模型）
src/                预处理 / 统计 / 基线 / 中文模型 / 趋势 / 预警
server/             FastAPI 分析服务（分析接口 + LLM 代理 + 用量账本）
web/                React + Vite + Tailwind + shadcn/ui 前端
docs/               范围定义、数据集文档、实验记录、错误分析、W3-W4 计划、改进点子
design/             UI 重设计稿（单文件 HTML，可直接浏览器打开）
data/ models/ outputs/  （gitignore，由脚本生成）
```

## 关键实验结论（详见 docs/experiment_log.md）

- 主指标 Macro-F1：最佳基线 **0.3921**（TF-IDF+LR, class_weight=balanced, DailyDialog test）；中文 RoBERTa（微博数据）Macro-F1 **0.6673**
- 多数类基线 Accuracy 即达 0.8167（多数类占 82.76%）——只看 Accuracy 会严重高估模型
- 朴素拼接上下文使 Macro-F1 下降（0.39→0.21），上下文建模需要专用 ERC 架构
- 冲突预警当前为**未经验证的启发式占位规则**，阈值待基于人工标注校准——它不是"冲突检测准确率"的证据

## 数据与引用

- DailyDialog: Li et al., *DailyDialog: A Manually Labelled Multi-turn Dialogue Dataset*, IJCNLP 2017（经 HuggingFace `daily_dialog` 获取）
- COVID-19 微博情绪数据：HuggingFace `souljoy/COVID-19_weibo_emotion`
- 中文预训练模型：`hfl/chinese-roberta-wwm-ext`（Cui et al.）

使用上述数据请遵循各自的许可并引用原始出处。
