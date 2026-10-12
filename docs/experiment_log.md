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

## LLM 联调记录（2026-10-10）

- 模型：kimi-k3（Moonshot AI）。该账号可用模型列表为 kimi-k2.7-code / kimi-k2.6 / kimi-k3 / kimi-k2.7-code-highspeed，旧名 moonshot-v1-8k 已 404。
- 接口限制（实测）：kimi-k3 仅允许 temperature=1，不支持 response_format=json_object；输出常带 ```json 围栏。
- 对应修改：server/app.py 移除 temperature / response_format 参数，新增 parse_llm_json() 容错解析（去围栏 + 截取首个 {...} 片段）；前端与示例配置默认模型名统一改为 kimi-k3。
- 端到端验证：POST /api/analyze 输入 4 轮中文对话（升职/陪伴冲突场景），llm_status=ok，返回局势分析、5 条建议、3 条不同风格回复草稿，内容合理且正确识别了情绪模型的误判。
- 已知局限（不变）：英文 ERC 模型对中文全部输出 no_emotion（W3 中文模型解决）；冲突预警仍为未验证启发式。

## W3 中文 ERC 模型（2026-10-10）

- 模型：hfl/chinese-roberta-wwm-ext + 分类头，微博情绪数据（train 8,606 / test 3,000，6 类，无 disgust），MPS 训练 3 epochs，18.2 分钟，种子 42。
- 指标由 `src/models/train_erc_zh.py` 自动生成于 `outputs/metrics/erc_zh_results.json`：**Accuracy 0.7973 / Macro-F1 0.6673 / Weighted-F1 0.7960**。
- 分类报告（test）：happiness F1 0.91、anger 0.79、no_emotion 0.68、sadness 0.60、fear 0.59、surprise 0.44（support 仅 68，指标不稳）。
- 后端接入：`server/app.py` 按 CJK 字符占比 >0.2 逐轮路由——中文走 RoBERTa，英文走原 TF-IDF E1w。趋势指标对缺失的 disgust 类按 0 处理，不受影响。
- 端到端验证：升职/陪伴冲突 4 轮对话，第 1、3 轮识别正确（happiness 0.99 / anger 0.75），趋势判为 worsening + medium 风险，LLM 分析正常。

### 必须标注的局限

1. **与英文基线不可直接比**：0.6673 是微博数据上的成绩，DailyDialog 的 0.3921 是另一个数据集，两者任务难度不同。
2. **跨域 + 反讽是已知短板**：实测「我为什么要高兴？你现在根本没时间陪我。」误判为 happiness（0.95）——训练数据是微博单帖，不含对话语境与反讽，字面「高兴」主导了判断。该案例已作为错误分析样本。
3. **不能当对话情绪真值用**：中文模型的输出应视为"字面情绪倾向"参考，冲突预警启发式叠加在其上，两层都未经人工校准。

## 大模型用量监控（2026-10-10）

- 后端每次成功调用将 API 返回的 usage 记入 `outputs/llm_usage.jsonl`（gitignore），按单价估算费用。
- 单价默认值取 kimi-k3 中国站官方价（2026-10 查询）：输入 ¥20 / 输出 ¥100 每百万 tokens；缓存命中价更低，故估算偏保守（高估）。实际扣费以 Moonshot 控制台为准。
- 预算熔断：累计估算费用达到 `budget_yuan`（默认 1.5 元）后，`/api/analyze` 跳过 LLM 调用并返回 llm_status=budget_exceeded；情绪识别与趋势分析不受影响。
- 实测单次分析：输入 371 + 输出 970 tokens（kimi-k3 思考计入输出）≈ ¥0.104，预算约可用 14 次。
- 局限：账本是本地文件，删除后重新计数；如需硬上限，应在 Moonshot 控制台同时设置。

## 切换默认模型：kimi-k3 → kimi-k2.6（2026-10-12）

- 应用户要求，默认模型从 kimi-k3 改为 kimi-k2.6（该账号可用模型之一，256K 上下文，支持思考/非思考模式）。
- 单价默认值改为 kimi-k2.6 中国站官方价（2026-10 查询 platform.kimi.com）：输入 ¥6.5 / 输出 ¥27 每百万 tokens；缓存命中价更低，估算仍偏保守。实际扣费以 Moonshot 控制台为准。
- 涉及文件：server/app.py（默认模型名与单价）、configs/llm.example.yaml、web/src/types/index.ts、web/src/lib/settings.ts；本地 configs/llm.yaml 同步更新（不入库）。
- 注意：outputs/llm_usage.jsonl 中 2026-10-12 之前的记录按 kimi-k3 单价估算，之后按 kimi-k2.6 单价，账本为混合口径，汇总值仅供参考。
- kimi-k3 的接口限制记录（temperature=1、无 response_format）保留在上方 2026-10-10 条目中，作为历史事实不改动；k2.6 是否支持 response_format 未实测，代码保持不传这两个参数的兼容写法。
