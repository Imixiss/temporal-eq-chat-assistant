# 错误分析（W2 · 待人工复核）

> 方法：从测试集预测结果中，随机抽取 20 条「真实标签非 no_emotion 且预测错误」的样本（seed=42）。
> 「错误原因」一栏需人工阅读完整对话后填写，下方为候选类别。

候选错误类型：隐含情绪 / 讽刺反话 / 多情绪共存 / 情绪转折 / 依赖前文 / 角色混淆 / 标签歧义

| # | 对话 ID | 轮 | 文本 | 真实 | 预测 | 置信度 | 错误原因（人工填） |
|---|---|---|---|---|---|---|---|
| 1 | dd_test_00777 | 2 | It ’ s too good to be true ! If I were there , I would ask h | happiness | surprise | 0.5128 | 待标注 |
| 2 | dd_test_00242 | 3 | Well , as the saying goes – we aim to please ! | happiness | no_emotion | 0.4695 | 待标注 |
| 3 | dd_test_00052 | 2 | You're smart to buy it . At 45 dollars for three days , it i | happiness | no_emotion | 0.4721 | 待标注 |
| 4 | dd_test_00832 | 0 | Look ! I bought these shoes only three weeks ago and there i | sadness | no_emotion | 0.3829 | 待标注 |
| 5 | dd_test_00436 | 9 | I am not interested in trying this restaurant again . | disgust | sadness | 0.3172 | 待标注 |
| 6 | dd_test_00371 | 9 | All right . | happiness | no_emotion | 0.4671 | 待标注 |
| 7 | dd_test_00354 | 0 | Hit ' em high , hit ' em low . Class of ' 93 — let's go ! | happiness | no_emotion | 0.5055 | 待标注 |
| 8 | dd_test_00267 | 3 | Sure , I ’ ll just go put the kettle on . Why don ’ t you ha | happiness | no_emotion | 0.4053 | 待标注 |
| 9 | dd_test_00826 | 2 | what a confidence ! I always watch a lot of movies , too . | happiness | no_emotion | 0.3434 | 待标注 |
| 10 | dd_test_00214 | 13 | Ah , get back to you . | disgust | anger | 0.2988 | 待标注 |
| 11 | dd_test_00796 | 4 | And English is very useful in your job . | happiness | no_emotion | 0.6611 | 待标注 |
| 12 | dd_test_00924 | 14 | That's why it looks so nice . I should have figured . You al | happiness | anger | 0.5512 | 待标注 |
| 13 | dd_test_00710 | 3 | It can't be expressed by words . | happiness | no_emotion | 0.3989 | 待标注 |
| 14 | dd_test_00176 | 0 | Look , how grand magnificent the Tiananmen Gate tour is ! | surprise | no_emotion | 0.4615 | 待标注 |
| 15 | dd_test_00741 | 1 | Yes , my friends like to get along with me well . | happiness | no_emotion | 0.3937 | 待标注 |
| 16 | dd_test_00625 | 3 | That's wonderful . I want to get a part-time job too . Tell  | happiness | no_emotion | 0.3198 | 待标注 |
| 17 | dd_test_00062 | 7 | No , thanks . I ' Ve had enough . I'll have my bill , please | happiness | no_emotion | 0.3697 | 待标注 |
| 18 | dd_test_00062 | 1 | Certainly . And what vegetables would you like ? | happiness | no_emotion | 0.4752 | 待标注 |
| 19 | dd_test_00189 | 16 | Oh , well , would you look at that ! Polarizing filters . | happiness | no_emotion | 0.3729 | 待标注 |
| 20 | dd_test_00352 | 5 | Cute ? Hope so . | surprise | happiness | 0.8052 | 待标注 |

## 主要错误类型总结（人工分析后填写）

- （待填）

## 下一轮优化方向（数据 / 模型 / 上下文，人工判断后填写）

- （待填）
