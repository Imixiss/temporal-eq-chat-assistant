import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import EmotionTimeline from '@/components/EmotionTimeline'
import SettingsDialog from '@/components/SettingsDialog'
import SuggestionsPanel from '@/components/SuggestionsPanel'
import { analyze, DEMO_INPUT, DEMO_RESPONSE, parseConversation } from '@/lib/api'
import { loadLlmSettings, saveLlmSettings } from '@/lib/settings'
import { EMOTION_ZH, type AnalyzeResponse, type LlmSettings } from '@/types'

const RISK_ZH = { low: '低风险', medium: '中风险', high: '高风险' } as const
const RISK_COLOR = { low: 'bg-green-100 text-green-800', medium: 'bg-amber-100 text-amber-800', high: 'bg-red-100 text-red-800' } as const
const TREND_ZH = { worsening: '恶化中 ↘', stable: '平稳 →', improving: '好转中 ↗' } as const

export default function Home() {
  const [llm, setLlm] = useState<LlmSettings>(loadLlmSettings())
  const [input, setInput] = useState('')
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    const turns = parseConversation(input)
    if (turns.length === 0) { setError('请先粘贴聊天记录（每行一条）'); return }
    setError(''); setLoading(true)
    try {
      const r = await analyze(turns, llm)
      setResult(r); setDemoMode(false)
    } catch {
      // 后端未启动：进入演示模式
      setResult(DEMO_RESPONSE); setDemoMode(true)
    } finally {
      setLoading(false)
    }
  }

  const onSaveSettings = (s: LlmSettings) => { setLlm(s); saveLlmSettings(s) }

  return (
    <div className="warm-page">
      <div className="bg-aurora" />
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
              placeholder={'每行一条消息，可带说话人前缀：\nA: 你今天怎么不回我消息？\nB: 我在开会啊，说了多少次了\n（不带前缀则按 A/B 自动交替）'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={run} disabled={loading} className="btn-warm border-0">{loading ? '分析中…' : '开始分析'}</Button>
              <Button variant="outline" onClick={() => setInput(DEMO_INPUT)}>载入示例</Button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </CardContent>
        </Card>

        {demoMode && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            分析服务未启动，当前展示内置演示数据。启动后端：<code>cd eq-chat-assistant && uvicorn server.app:app --port 8000</code>
          </div>
        )}

        {result && (
          <>
            {/* 趋势总览 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card className="warm-card rise-in"><CardContent className="pt-4 text-center">
                <div className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${RISK_COLOR[result.risk.conflict_risk]}`}>
                  {RISK_ZH[result.risk.conflict_risk]}
                </div>
                <p className="text-xs text-muted-foreground mt-2">冲突风险（启发式，待校准）</p>
              </CardContent></Card>
              <Card className="warm-card rise-in"><CardContent className="pt-4 text-center">
                <div className="text-xl font-semibold">{TREND_ZH[result.risk.trend]}</div>
                <p className="text-xs text-muted-foreground mt-1">情绪趋势</p>
              </CardContent></Card>
              <Card className="warm-card rise-in"><CardContent className="pt-4 text-center">
                <div className="text-xl font-semibold">{result.metrics.polarity_flips}</div>
                <p className="text-xs text-muted-foreground mt-1">情绪翻转次数</p>
              </CardContent></Card>
              <Card className="warm-card rise-in"><CardContent className="pt-4 text-center">
                <div className="text-xl font-semibold">{result.metrics.max_negative_streak}</div>
                <p className="text-xs text-muted-foreground mt-1">最长连续负向轮数</p>
              </CardContent></Card>
              <Card className="warm-card rise-in"><CardContent className="pt-4 text-center">
                <div className="text-xl font-semibold">{result.metrics.volatility.toFixed(2)}</div>
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
                      {result.turns.map((t) => (
                        <TableRow key={t.turn_id}>
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
