# 实验记录（W1–W2）

环境：Python 3.12.14 / scikit-learn 1.9.0 / macOS（CPU）。随机种子 42，配置见 `configs/baseline.yaml`。
所有数字由 `src/models/baseline.py` 自动生成于 `outputs/metrics/erc_results.json`，非手工填写。

## 主结果表（DailyDialog test，7,740 条）

| 实验 | 输入 | Accuracy | Macro-F1 | Weighted-F1 |
|---|---|---:|---:|---:|
| E0 多数类 | 无 | 0.8167 | 0.1284 | 0.7343 |
| E1 TF-IDF+LR | 当前轮 | 0.8461 | 0.2609 | 0.8138 |
| E1b TF-IDF+LR | 仅历史上下文 | 0.8199 | 0.1664 | 0.7672 |
| E1w TF-IDF+LR（balanced） | 当前轮 | 0.7141 | **0.3921** | 0.7508 |
| E2 TF-IDF+LR | 最近 1 轮+当前轮 | 0.8425 | 0.2322 | 0.8086 |
| E3 TF-IDF+LR | 最近 3 轮+当前轮 | 0.8293 | 0.2139 | 0.7943 |

最佳模型（按 Macro-F1）：**E1w（当前轮 + class_weight=balanced）**，逐轮概率已存至
`outputs/predictions/erc_test_predictions.jsonl`。分类报告见 `outputs/metrics/erc_report_E1w_tfidf_current_bal.txt`。

## 三个诚实的结论

1. **Accuracy 会骗人**：E0 什么都不学就有 81.67% 准确率（多数类占 82.76%）。Macro-F1 才是有效指标。
2. **朴素拼接上下文反而掉点**：E2/E3 的 Macro-F1 低于 E1。上下文不是没用——E1b 显示历史单独只有 0.1664 的 Macro-F1——而是"拼字符串"这种用法太粗糙，需要带注意力/说话人建模的 ERC 模型（W3+ 的 TodKat 或 PLM 路线）。
3. **class_weight=balanced 把 Macro-F1 从 0.26 拉到 0.39**，代价是 Accuracy 降 13 个点。少数类召回明显提升（sadness recall 0.60），但精度很低（0.16）——误报多，趋势分析时需注意。

## 少数类表现（E1w，test）

| 类别 | Precision | Recall | F1 | Support |
|---|---:|---:|---:|---:|
| anger | 0.23 | 0.53 | 0.32 | 118 |
| disgust | 0.20 | 0.34 | 0.25 | 47 |
| fear | 0.23 | 0.41 | 0.29 | 17 |
| happiness | 0.43 | 0.68 | 0.53 | 1019 |
| sadness | 0.16 | 0.60 | 0.26 | 102 |
| surprise | 0.18 | 0.59 | 0.28 | 116 |

fear/disgust 样本太少（test 各 17/47 条），指标不稳定，解释时需保守。

## 时序与预警（W2）

- 时序指标函数（极性翻转次数 / 最大连续负向轮数 / 波动幅度 / 负向概率斜率）已对 test 全部 1,000 段对话计算，存 `outputs/metrics/temporal_metrics.json`。
- 趋势图 12 张（按波动+斜率排序选取），存 `outputs/figures/conversation_trends/`。
- 冲突预警启发式 v0.1 输出分布：low 710 / medium 279 / high 11。**该结果为未经验证的占位规则，阈值留待 W3 依据分布与人工标注校准，不能作为冲突检测效果证据。**

## 已知问题（下一轮处理）

- TF-IDF 无法处理讽刺、隐含情绪；错误分析待人工复核（`docs/error_analysis.md`）
- 预训练模型（BERT 类）基线未做：当前环境未装 transformers，作为 W3 的可选增强，不阻塞主流程
- 趋势分数映射是展示用启发式，不是心理学情绪强度
