# 项目范围定义（W1）

## 项目目标

时序感知高情商聊天助手：输入一段多轮对话，输出逐轮情绪分析、情绪趋势与冲突风险提示，并（在接入 LLM 后）给出沟通建议与高情商回复草稿。

## 任务分层

### 任务 A：单轮/上下文情绪识别（ERC）

- 输入：当前 utterance（可选：前 N 轮上下文）
- 输出：`{"emotion": "sadness", "confidence": 0.82}`
- 第 1–2 周基线：DailyDialog，7 类情绪（见 `configs/baseline.yaml`）

### 任务 B：对话级趋势分析

- 输入：逐轮 `{turn_id, speaker, emotion, confidence, probabilities}`
- 输出：`{"trend": "worsening", "conflict_risk": "medium", "reason_codes": [...]}`
- 当前版本为**未经验证的启发式原型**（见 `src/analysis/conflict_heuristic.py` 头部声明）

### 任务 C：建议与回复生成（W5 起，依赖 LLM）

- 输入：整段对话 + 任务 A/B 的结构化情绪序列
- 输出：局势分析、沟通建议、2–3 条回复草稿
- **本仓库只预留接口；未接入 LLM 时该层不工作，不用模板话术冒充**

## 第一版约定

- 情绪类别：DailyDialog 官方 7 类（no_emotion / anger / disgust / fear / happiness / sadness / surprise）
- 说话人：区分 A/B（DailyDialog 二人对话按轮次交替）
- 上下文：基线已做 0 / 1 / 3 轮消融；结论见 `docs/experiment_log.md`
- 语言：第一阶段为英文数据，**不代表已具备中文能力**

## 第一阶段明确不做的事

- 不训练端到端聊天模型
- 不把"冲突"等同于"负面情绪"
- 不用 BLEU/ROUGE 评价回复质量
- 不用 ESConv 做逐轮情绪分类的监督数据（它只有对话级情绪类别与支持策略标注，缺逐轮情绪真值）
