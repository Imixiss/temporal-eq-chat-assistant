# 数据集文档（W1）

## DailyDialog（主数据集，ERC 基线）

- 来源：HuggingFace `daily_dialog`（官方 parquet 转换，经 hf-mirror 下载，2026-10-08）
- 原始论文：Li et al., *DailyDialog: A Manually Labelled Multi-turn Dialogue Dataset*, IJCNLP 2017
- 标注：逐轮情绪标签 + 对话行为（dialog act）；二人对话，无显式 speaker 字段（按轮次交替记为 A/B）
- 许可/引用：使用前请引用原论文；数据版权归原作者

### 实测规模（脚本 `src/data/statistics.py` 自动生成）

| 划分 | 对话数 | utterance 数 | 平均轮数 | 最短/最长轮数 |
|---|---:|---:|---:|---|
| train | 11,118 | 87,170 | 7.84 | 2 / 35 |
| validation | 1,000 | 8,069 | 8.07 | 2 / 31 |
| test | 1,000 | 7,740 | 7.74 | 2 / 26 |

与官方公布的 ~13k 对话规模一致。划分沿用官方，不重新随机切分，保证与文献可比、避免同一对话跨划分泄漏。

### 情绪类别分布（train）

| 类别 | 数量 | 占比 |
|---|---:|---:|
| no_emotion | 72,143 | 82.76% |
| happiness | 11,182 | 12.83% |
| surprise | 1,600 | 1.84% |
| sadness | 969 | 1.11% |
| anger | 827 | 0.95% |
| disgust | 303 | 0.35% |
| fear | 146 | 0.17% |

**类别极不均衡**：多数类占 82.76%，因此评估以 Macro-F1 为主指标，Accuracy 仅作参考。

### 数据质量记录

- 缺失情绪标签：0
- 重复文本比例：train 17.11% / val 5.27% / test 3.68%（多为 "Good." "OK." 类短句，属对话数据常态）
- utterance 长度：1–278 词，平均 13.61 词
- speaker 分布：A 45,533 / B 41,637（A 略多因为 A 总是先发言）

## COVID-19 微博情绪数据（中文 ERC 训练集，W3 已下载）

- 来源：HuggingFace `souljoy/COVID-19_weibo_emotion`（经 hf-mirror 下载，2026-10-08）
- 规模（实测与 README 一致）：train 8,606 / validation 2,000 / test 3,000
- 标签 6 类：neutral / happy / angry / sad / fear / surprise，已映射到项目 7 类体系；**disgust 无数据，明确标注为不支持**
- 类分布（train）：happy 4,423 / neutral 1,460 / angry 1,322 / sad 649 / fear 555 / surprise 197
- **域差异提醒**：疫情相关微博单帖，不是对话数据；对话适应性需 W4 用真实对话验证

## ESConv（备用，W3+ 用于支持策略与回复生成）

- 来源：thu-coai/Emotional-Support-Conversation（ACL 2021）
- **注意**：只含对话级情绪类别与支持策略标注，无逐轮情绪真值，不能用作 ERC 监督数据
- 本阶段未下载，W3 接入

## EmpatheticDialogues（备用，跨数据集泛化检验）

- 本阶段未下载，需要时再补
