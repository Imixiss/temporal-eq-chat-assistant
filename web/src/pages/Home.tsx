import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import EmotionTimeline from '@/components/EmotionTimeline'
import SettingsDialog from '@/components/SettingsDialog'
import SuggestionsPanel from '@/components/SuggestionsPanel'
import { analyze, DEMO_INPUT, DEMO_RESPONSE, ocrImage, parseConversation } from '@/lib/api'
import { loadLlmSettings, saveLlmSettings } from '@/lib/settings'
import { EMOTION_ZH, type AnalyzeResponse, type LlmSettings } from '@/types'

const RISK_ZH = { low: '低风险', medium: '中风险', high: '高风险' } as const
const RISK_COLOR = { low: 'bg-green-100 text-green-800', medium: 'bg-amber-100 text-amber-800', high: 'bg-red-100 text-red-800' } as const
const TREND_ZH = { worsening: '恶化中 ↘', stable: '平稳 →', improving: '好转中 ↗' } as const

/** 分析阶段文案（进度条为时间预估示意，真实进度取决于后端与模型响应） */
const STAGES = [
  { until: 30, text: '🔍 正在逐轮识别情绪…' },
  { until: 60, text: '📈 正在计算情绪时序趋势…' },
  { until: 90, text: '💬 正在等待大模型生成建议…' },
]

/** 点击按钮时从按钮中心溅出暖色气泡粒子 */
function spawnBubbles(e: React.MouseEvent) {
  const host = document.getElementById('burst-layer')
  if (!host) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('span')
    b.className = 'burst-bubble'
    const ang = (Math.PI * 2 * i) / 12 + Math.random() * 0.6
    const dist = 36 + Math.random() * 52
    b.style.left = `${cx}px`
    b.style.top = `${cy}px`
    b.style.setProperty('--dx', `${Math.cos(ang) * dist}px`)
    b.style.setProperty('--dy', `${Math.sin(ang) * dist}px`)
    const s = 5 + Math.random() * 8
    b.style.width = `${s}px`
    b.style.height = `${s}px`
    host.appendChild(b)
    setTimeout(() => b.remove(), 700)
  }
}

export default function Home() {
  const [llm, setLlm] = useState<LlmSettings>(loadLlmSettings())
  const [input, setInput] = useState('')
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [error, setError] = useState('')
  const [prog, setProg] = useState(0)  // 0 = 空闲；>0 = 分析中（时间预估示意）
  const fileRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startProgress = () => {
    setProg(3)
    timerRef.current = setInterval(() => {
      setProg((p) => (p > 0 && p < 90 ? p + Math.max(1, (90 - p) * 0.06) : p))
    }, 300)
  }
  const stopProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setProg(100)
    setTimeout(() => setProg(0), 500)
  }

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(''); setOcrLoading(true)
    try {
      const r = await ocrImage(file)
      if (r.ok) {
        setInput(r.lines.join('\n'))
      } else {
        setError(r.message ?? '识别失败')
      }
    } catch {
      setError('识别服务未启动或识别失败（OCR 仅支持本机 macOS 后端）')
    } finally {
      setOcrLoading(false)
    }
  }

  const run = async (e: React.MouseEvent) => {
    spawnBubbles(e)
    const turns = parseConversation(input)
    if (turns.length === 0) { setError('请先粘贴聊天记录（每行一条）'); return }
    setError(''); setLoading(true); startProgress()
    try {
      const r = await analyze(turns, llm)
      setResult(r); setDemoMode(false)
    } catch {
      // 后端未启动：进入演示模式
      setResult(DEMO_RESPONSE); setDemoMode(true)
    } finally {
      setLoading(false); stopProgress()
    }
  }

  const onSaveSettings = (s: LlmSettings) => { setLlm(s); saveLlmSettings(s) }

  return (
    <div className="warm-page">
      <div className="bg-aurora" />
      <div id="burst-layer" />
      <header className="warm-content border-b border-[rgba(190,140,90,.16)] bg-[rgba(255,253,250,.75)] backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold"><span className="brand-dot" />时序感知高情商聊天助手</h1>
            <p className="text-xs text-muted-foreground">读懂整段对话的情绪走向，再帮你回下一句</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={llm.apiKey ? 'default' : 'secondary'}>
              {llm.apiKey ? '大模型已接入' : '大模型未接入'}
            </Badge>
            <SettingsDialog settings={llm} onSave={onSaveSettings} />
          </div>
        </div>
      </header>

      <main className="warm-content max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 输入区 */}
        <Card className="warm-card rise-in">
          <CardHeader><CardTitle className="text-base">📥 粘贴聊天记录</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={6}
              placeholder={'支持三种方式：\n① 直接粘贴微信/QQ复制的记录（自动识别昵称+时间戳格式）\n② 点下方「上传截图」自动识别文字\n③ 手动格式：A: 消息 / B：消息（不带前缀则按 A/B 交替）'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="flex gap-2 items-center flex-wrap">
              <Button onClick={run} disabled={loading || ocrLoading} className="btn-warm border-0">
                {loading ? <>分析中<span className="loading-dots"><i /><i /><i /></span></> : '开始分析'}
              </Button>
              <Button variant="outline" onClick={(e) => { spawnBubbles(e); setInput(DEMO_INPUT) }}>载入示例</Button>
              <Button variant="outline" disabled={ocrLoading} onClick={(e) => { spawnBubbles(e); fileRef.current?.click() }}>
                {ocrLoading ? <>识别中<span className="loading-dots"><i /><i /><i /></span></> : '📷 上传截图识别'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickImage}
              />
            </div>
            <p className="text-xs text-muted-foreground">截图识别在本机完成（macOS Vision），图片不会上传到任何服务器。</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </CardContent>
        </Card>

        {demoMode && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            分析服务未启动，当前展示内置演示数据。启动后端：<code>cd eq-chat-assistant && uvicorn server.app:app --port 8000</code>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            {/* 分阶段进度条（时间预估示意） */}
            <Card className="warm-card rise-in">
              <CardContent className="pt-5 pb-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{STAGES.find((s) => prog <= s.until)?.text ?? STAGES[2].text}</span>
                  <span className="text-muted-foreground tabular-nums">{Math.min(Math.round(prog), 99)}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.min(prog, 99)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">进度为预估示意；首次分析需加载中文模型，会慢一些。</p>
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-24" />)}
            </div>
            <div className="skeleton h-72" />
            <div className="grid md:grid-cols-2 gap-4">
              <div className="skeleton h-64" />
              <div className="skeleton h-64" />
            </div>
          </div>
        )}

        {result && !loading && (
          <>
            {/* 趋势总览 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card className="warm-card rise-in"><CardContent className="pt-4 text-center">
                <div className={`inline-block rounded-full px-3 py-1 text-sm font-medium num-pop ${RISK_COLOR[result.risk.conflict_risk]} ${result.risk.conflict_risk !== 'low' ? 'pulse-glow' : 'pulse-glow-warm'}`}>
                  {RISK_ZH[result.risk.conflict_risk]}
                </div>
                <p className="text-xs text-muted-foreground mt-2">冲突风险（启发式，待校准）</p>
              </CardContent></Card>
              <Card className="warm-card rise-in"><CardContent className="pt-4 text-center">
                <div className="text-xl font-semibold num-pop">{TREND_ZH[result.risk.trend]}</div>
                <p className="text-xs text-muted-foreground mt-1">情绪趋势</p>
              </CardContent></Card>
              <Card className="warm-card rise-in"><CardContent className="pt-4 text-center">
                <div className="text-xl font-semibold num-pop" style={{ animationDelay: '.06s' }}>{result.metrics.polarity_flips}</div>
                <p className="text-xs text-muted-foreground mt-1">情绪翻转次数</p>
              </CardContent></Card>
              <Card className="warm-card rise-in"><CardContent className="pt-4 text-center">
                <div className="text-xl font-semibold num-pop" style={{ animationDelay: '.12s' }}>{result.metrics.max_negative_streak}</div>
                <p className="text-xs text-muted-foreground mt-1">最长连续负向轮数</p>
              </CardContent></Card>
              <Card className="warm-card rise-in"><CardContent className="pt-4 text-center">
                <div className="text-xl font-semibold num-pop" style={{ animationDelay: '.18s' }}>{result.metrics.volatility.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1">情绪波动幅度</p>
              </CardContent></Card>
            </div>

            {/* 情绪时间线 */}
            <Card className="warm-card rise-in" style={{ animationDelay: '.08s' }}>
              <CardHeader><CardTitle className="text-base">📈 情绪时间线</CardTitle></CardHeader>
              <CardContent>
                <EmotionTimeline turns={result.turns} />
                <p className="text-xs text-muted-foreground mt-2">
                  蓝线=情绪走向（左轴，仅展示用）；红线=负面情绪概率（右轴）；橙色点=低置信度轮次。
                </p>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4 items-start">
              {/* 逐轮明细 */}
              <Card className="warm-card rise-in" style={{ animationDelay: '.14s' }}>
                <CardHeader><CardTitle className="text-base">🔎 逐轮情绪明细</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">轮</TableHead>
                        <TableHead className="w-12">说话人</TableHead>
                        <TableHead>文本</TableHead>
                        <TableHead className="w-24">情绪</TableHead>
                        <TableHead className="w-16">置信度</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.turns.map((t, idx) => (
                        <TableRow key={t.turn_id} className="row-in" style={{ animationDelay: `${Math.min(idx * 0.05, 0.5)}s` }}>
                          <TableCell>{t.turn_id + 1}</TableCell>
                          <TableCell>{t.speaker}</TableCell>
                          <TableCell className="max-w-[220px] truncate" title={t.text}>{t.text}</TableCell>
                          <TableCell>{EMOTION_ZH[t.emotion] ?? t.emotion}</TableCell>
                          <TableCell className={t.confidence < 0.5 ? 'text-amber-600' : ''}>
                            {(t.confidence * 100).toFixed(0)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* 建议区 */}
              <SuggestionsPanel suggestions={result.suggestions} llmStatus={result.llm_status} llmMessage={result.llm_message} />
            </div>

            {result.risk.reason_codes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                预警信号：{result.risk.reason_codes.join('、')} · {result.risk.note}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
