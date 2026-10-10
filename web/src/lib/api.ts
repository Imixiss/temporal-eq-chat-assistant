import type { AnalyzeResponse, LlmSettings, TurnInput } from '@/types'

/** 说话人昵称映射：先出现的非"我"昵称视为对方（B），"我"/A 视为自己（A） */
function makeSpeakerMapper() {
  const map = new Map<string, string>()
  return (name: string): string => {
    const n = name.trim()
    if (/^(我|A)$/i.test(n)) return 'A'
    if (!map.has(n)) map.set(n, map.size === 0 ? 'B' : `P${map.size + 1}`)
    return map.get(n)!
  }
}

/** 微信/QQ 复制或 OCR 出来的"昵称 + 时间戳"标题行，如：
 *  "小美 昨天 21:03" / "张三 2026/10/10 14:32:11" / "小美 21:03" */
const HEADER_RE = /^(\S{1,20})\s+(?:(?:今天|昨天|前天|星期\S|\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)\s+)?(?:[上下]午\s*)?\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM|am|pm)?$/
/** "昵称：消息" 或 "A: 消息" 单行格式 */
const INLINE_RE = /^([^\s:：]{1,12})\s*[:：]\s*(.+)$/
/** 微信导出里的占位内容 */
const PLACEHOLDER_RE = /^\[(图片|表情|视频|语音|文件|链接|转账|红包|位置)\]$/

/** OCR 可能丢掉昵称与日期间的空格（如「我昨天 21:05」），
 *  标题行捕获到的名字若以防日期词结尾，剥掉后缀 */
const DATE_SUFFIX_RE = /(今天|昨天|前天|星期[一二三四五六日天])$/
/** 截图/导出里常见的标题行，不是消息 */
const TITLE_LINE_RE = /^(微信|QQ)?聊天记录$/

/** 解析粘贴的聊天记录，支持四种格式：
 *  1. 微信/QQ 导出：标题行（昵称+时间）后跟一行或多行消息
 *  2. 昵称：消息（任意昵称，自动映射为 A/B）
 *  3. A: 消息 / B：消息 / 我：消息 / 对方：消息
 *  4. 无前缀：按 A/B 交替 */
export function parseConversation(raw: string): TurnInput[] {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const toSpeaker = makeSpeakerMapper()
  const turns: TurnInput[] = []
  let curSpeaker: string | null = null

  const flush = (buf: string[]) => {
    const text = buf.join('\n').trim()
    if (text && !PLACEHOLDER_RE.test(text)) {
      turns.push({ speaker: curSpeaker ?? (turns.length % 2 === 0 ? 'A' : 'B'), text })
    }
  }

  let buf: string[] = []
  let structured = false  // 是否识别到了昵称格式（决定无前缀行如何归属）

  for (const line of lines) {
    if (TITLE_LINE_RE.test(line)) continue  // 跳过「微信聊天记录」等标题行
    const head = line.match(HEADER_RE)
    const inline = line.match(INLINE_RE)
    if (head) {
      flush(buf); buf = []
      curSpeaker = toSpeaker(head[1].replace(DATE_SUFFIX_RE, ''))
      structured = true
    } else if (inline && (structured || /^(A|B|我|对方)$/i.test(inline[1]))) {
      flush(buf); buf = []
      curSpeaker = toSpeaker(inline[1] === '对方' ? 'B' : inline[1])
      buf.push(inline[2])
      structured = true
    } else if (structured && curSpeaker) {
      buf.push(line)  // 消息正文（可多行）
    } else {
      // 完全无前缀：每行一条，A/B 交替
      flush(buf); buf = []
      curSpeaker = null
      turns.push({ speaker: turns.length % 2 === 0 ? 'A' : 'B', text: line })
    }
  }
  flush(buf)
  return turns
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

export interface OcrResponse {
  ok: boolean
  lines: string[]
  message: string | null
}

/** 上传聊天截图，调用后端 macOS Vision 本地 OCR（图片不出本机） */
export async function ocrImage(file: File): Promise<OcrResponse> {
  const resp = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'image/png' },
    body: file,
  })
  if (!resp.ok) throw new Error(`识别服务返回 ${resp.status}`)
  return (await resp.json()) as OcrResponse
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
