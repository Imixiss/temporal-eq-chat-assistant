import type { AnalyzeResponse, LlmSettings, TurnInput } from '@/types'

/** 解析用户粘贴的聊天记录：每行一条，支持 "A: 文本" / "B：文本" 前缀，无前缀则按 A/B 交替 */
export function parseConversation(raw: string): TurnInput[] {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  return lines.map((line, i) => {
    const m = line.match(/^([ABab我对方]{1,2})\s*[:：]\s*(.+)$/)
    if (m) {
      const sp = m[1]
      const speaker = sp === '我' ? 'A' : sp === '对方' ? 'B' : sp.toUpperCase()
      return { speaker, text: m[2] }
    }
    return { speaker: i % 2 === 0 ? 'A' : 'B', text: line }
  })
}

export async function analyze(turns: TurnInput[], llm: LlmSettings): Promise<AnalyzeResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (llm.apiKey) {
    headers['X-LLM-Key'] = llm.apiKey
    headers['X-LLM-Base-URL'] = llm.baseUrl
    headers['X-LLM-Model'] = llm.model
  }
  const resp = await fetch('/api/analyze', {
    method: 'POST',
    headers,
    body: JSON.stringify({ turns }),
  })
  if (!resp.ok) throw new Error(`分析服务返回 ${resp.status}`)
  return (await resp.json()) as AnalyzeResponse
}

/** 后端未启动时的演示数据（前端明确标注为演示） */
export const DEMO_RESPONSE: AnalyzeResponse = {
  turns: [
    { turn_id: 0, speaker: 'A', text: 'I got promoted at work today!', emotion: 'happiness', confidence: 0.91, probabilities: { happiness: 0.91, no_emotion: 0.06, surprise: 0.03 } },
    { turn_id: 1, speaker: 'B', text: 'Oh. I see.', emotion: 'no_emotion', confidence: 0.62, probabilities: { no_emotion: 0.62, sadness: 0.21, anger: 0.17 } },
    { turn_id: 2, speaker: 'A', text: 'You do not sound very happy for me.', emotion: 'sadness', confidence: 0.55, probabilities: { sadness: 0.55, no_emotion: 0.3, anger: 0.15 } },
    { turn_id: 3, speaker: 'B', text: 'Why should I be? You never have time for me anymore.', emotion: 'anger', confidence: 0.78, probabilities: { anger: 0.78, sadness: 0.12, no_emotion: 0.1 } },
    { turn_id: 4, speaker: 'A', text: 'That is unfair. I am doing this for us.', emotion: 'anger', confidence: 0.71, probabilities: { anger: 0.71, sadness: 0.2, no_emotion: 0.09 } },
  ],
  metrics: { polarity_flips: 2, max_negative_streak: 2, volatility: 0.86, negative_prob_slope: 0.19 },
  risk: {
    trend: 'worsening',
    conflict_risk: 'medium',
    reason_codes: ['negative_emotion_increase', 'rapid_emotion_change'],
    note: 'heuristic_unverified: 演示数据',
  },
  suggestions: null,
  llm_status: 'not_configured',
  llm_message: '演示模式：后端未启动，以上为内置示例数据',
}

export const DEMO_INPUT = `A: I got promoted at work today!
B: Oh. I see.
A: You do not sound very happy for me.
B: Why should I be? You never have time for me anymore.
A: That is unfair. I am doing this for us.`
