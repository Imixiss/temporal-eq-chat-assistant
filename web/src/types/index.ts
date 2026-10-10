export interface TurnInput {
  speaker: string
  text: string
}

export interface TurnAnalysis {
  turn_id: number
  speaker: string
  text: string
  emotion: string
  confidence: number
  probabilities: Record<string, number>
}

export interface TemporalMetrics {
  polarity_flips: number
  max_negative_streak: number
  volatility: number
  negative_prob_slope: number
}

export interface RiskAssessment {
  trend: 'worsening' | 'stable' | 'improving'
  conflict_risk: 'low' | 'medium' | 'high'
  reason_codes: string[]
  note: string
}

export interface ReplyDraft {
  style: string
  text: string
}

export interface Suggestions {
  situation_analysis: string
  advice: string[]
  reply_drafts: ReplyDraft[]
}

export interface AnalyzeResponse {
  turns: TurnAnalysis[]
  metrics: TemporalMetrics
  risk: RiskAssessment
  suggestions: Suggestions | null
  llm_status: 'ok' | 'not_configured' | 'error'
  llm_message?: string
}

export interface LlmSettings {
  provider: string
  baseUrl: string
  model: string
  apiKey: string
}

export const LLM_PROVIDERS: Record<string, { label: string; baseUrl: string; model: string }> = {
  kimi: { label: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  custom: { label: '自定义（OpenAI 兼容）', baseUrl: '', model: '' },
}

export const EMOTION_ZH: Record<string, string> = {
  no_emotion: '无明显情绪',
  anger: '愤怒',
  disgust: '厌恶',
  fear: '恐惧',
  happiness: '开心',
  sadness: '难过',
  surprise: '惊讶',
}

export const EMOTION_SCORE: Record<string, number> = {
  happiness: 1.0,
  surprise: 0.2,
  no_emotion: 0.0,
  sadness: -0.5,
  fear: -0.6,
  disgust: -0.7,
  anger: -0.8,
}

export const NEGATIVE_EMOTIONS = ['anger', 'disgust', 'fear', 'sadness']
