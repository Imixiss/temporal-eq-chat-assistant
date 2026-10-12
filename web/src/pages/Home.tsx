import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import EmotionTimeline from '@/components/EmotionTimeline'
import SettingsDialog from '@/components/SettingsDialog'
import SuggestionsPanel from '@/components/SuggestionsPanel'
import { analyze, DEMO_INPUT, DEMO_RESPONSE, getUsage, ocrImage, parseConversation } from '@/lib/api'
import { loadLlmSettings, saveLlmSettings } from '@/lib/settings'
import { EMOTION_ZH, type AnalyzeResponse, type LlmSettings, type UsageStats } from '@/types'

/* 【1】风险色：浅底 + 深字 + 图标（不只靠颜色区分等级） */
const RISK_ZH = { low: '低风险', medium: '中风险', high: '高风险' } as const
const RISK_LEVEL = { low: '低', medium: '中', high: '高' } as const
const RISK_ICON = { low: '✅', medium: '⚠️', high: '🚨' } as const
const RISK_BANNER = {
  low: 'bg-[#DCFCE7] text-[#15803D]',
  medium: 'bg-[#FEF3C7] text-[#92400E]',
  high: 'bg-[#FEE2E2] text-[#B91C1C]',
} as const
const TREND_ZH = { worsening: '恶化中 ↘', stable: '平稳 →', improving: '好转中 ↗' } as const

/** 后端预警信号代码 → 中文（代码见 src/analysis/conflict_heuristic.py） */
const REASON_ZH: Record<string, string> = {
  'negative_emotion_streak>=3_and_rising': '负向情绪连续多轮且仍在上升',
  'negative_emotion_increase': '负向情绪整体呈上升趋势',
  'rapid_emotion_change': '情绪正负翻转频繁',
  'negative_emotion_streak>=2': '出现连续负向情绪轮次',
  'no_strong_signal': '未检测到明显预警信号',
}

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

/** 指标小卡：图标 + 名称(13px 次要色) + ⓘ说明 → 大数字 → 一行解读 */
function MetricCard(props: { icon: string; name: string; tip: string; value: string; caption: string; delay?: string }) {
  return (
    <Card className="warm-card rise-in" style={{ animationDelay: props.delay }}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
          <span aria-hidden>{props.icon}</span>
          <span>{props.name}</span>
          <button className="info-dot" aria-label={`${props.name}说明`}>
            ⓘ<span className="info-tip">{props.tip}</span>
          </button>
        </div>
        <div className="text-[32px] leading-tight font-bold num-pop">{props.value}</div>
        <p className="text-[12.5px] text-muted-foreground">{props.caption}</p>
      </CardContent>
    </Card>
  )
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
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { getUsage().then(setUsage) }, [])

  /* 【3】说话人行预览：第一个出现的说话人视为「我」（橙色），其余为对方（灰蓝） */
  const previewTurns = useMemo(() => parseConversation(input).slice(0, 6), [input])
  const previewTotal = useMemo(() => (input.trim() ? parseConversation(input).length : 0), [input])
  const meSpeaker = previewTurns[0]?.speaker

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
      getUsage().then(setUsage)  // 分析结束后刷新用量显示
    }
  }

  const onSaveSettings = (s: LlmSettings) => { setLlm(s); saveLlmSettings(s) }
  const usagePct = usage ? Math.min(100, (usage.cost_yuan / usage.budget_yuan) * 100) : 0

  return (
    <div className="warm-page">
      <div className="bg-aurora" />
      <div id="burst-layer" />

      {/* 【2】顶部栏 64px：左应用名 / 右额度进度条 + 状态点 + 设置 */}
      <header className="warm-content border-b border-[rgba(190,140,90,.16)] bg-[rgba(255,253,250,.75)] backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1120px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold leading-tight"><span className="brand-dot" />时序感知高情商聊天助手</h1>
            <p className="text-[13px] text-muted-foreground hidden sm:block">粘贴聊天记录，看清情绪走向</p>
          </div>
          <div className="flex items-center gap-4">
            {usage && (
              <div
                className="flex flex-col gap-1 min-w-[110px] sm:min-w-[160px]"
                role="status"
                aria-label={`本月大模型额度已用 ${usage.cost_yuan.toFixed(3)} 元，预算 ${usage.budget_yuan} 元`}
                title={`本地账本估算（按官方价未命中缓存保守计算）：调用 ${usage.calls} 次，输入 ${usage.prompt_tokens} / 输出 ${usage.completion_tokens} tokens。实际扣费以 Moonshot 控制台为准。`}
              >
                <span className={`text-xs whitespace-nowrap ${usage.cost_yuan >= usage.budget_yuan ? 'text-red-700 font-medium' : 'text-muted-foreground'}`}>
                  已用 ¥{usage.cost_yuan.toFixed(3)} / ¥{usage.budget_yuan}
                </span>
                <div className="usage-track"><div className="usage-fill" style={{ width: `${usagePct}%` }} /></div>
              </div>
            )}
            <Badge
              variant={llm.apiKey ? 'default' : 'secondary'}
              className={llm.apiKey ? 'bg-[#DCFCE7] text-[#15803D] hover:bg-[#DCFCE7] border-0' : ''}
            >
              <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${llm.apiKey ? 'bg-green-500' : 'bg-gray-400'}`} />
              {llm.apiKey ? '已接入' : '未接入'}
            </Badge>
            <SettingsDialog settings={llm} onSave={onSaveSettings} />
          </div>
        </div>
      </header>

      {/* 【2】桌面端左右两栏（5/12 + 7/12），左栏 sticky；<1024px 单列 */}
      <main className="warm-content max-w-[1120px] mx-auto px-6 py-6 space-y-6 lg:space-y-0 lg:grid lg:grid-cols-[5fr_7fr] lg:gap-6 lg:items-start">

        {/* 【3】输入卡片（左栏） */}
        <section className="lg:sticky lg:top-[88px]">
          <Card className="warm-card rise-in">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">聊天记录输入</CardTitle>
              <p className="text-[13px] text-muted-foreground">支持直接粘贴微信 / QQ 复制的记录，或上传截图识别</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                aria-label="聊天记录输入框"
                className="min-h-[220px] resize-y font-mono text-[13px] leading-[1.6] bg-[#FFFCF7]"
                placeholder={'粘贴聊天记录，支持三种方式：\n① 直接粘贴微信/QQ复制的记录（自动识别昵称+时间戳格式）\n② 点下方「上传截图识别」自动识别文字\n③ 手动格式：A: 消息 / B：消息（不带前缀则按 A/B 交替）'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />

              {/* 说话人行预览：我=橙，对方=灰蓝 */}
              {previewTurns.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">已识别 <b>{previewTotal}</b> 轮对话</span>
                  {previewTurns.map((t, i) => (
                    <div key={i} className={`turn-line ${t.speaker === meSpeaker ? 'me' : 'other'}`} title={t.text}>
                      {t.speaker}：{t.text}
                    </div>
                  ))}
                  {previewTotal > 6 && <span className="text-xs text-muted-foreground">…共 {previewTotal} 轮</span>}
                </div>
              )}

              {/* 按钮区：主按钮宽大实心，次按钮描边；手机端纵向撑满 */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={run} disabled={loading || ocrLoading} className="btn-warm border-0 flex-1">
                  {loading ? <>分析中<span className="loading-dots"><i /><i /><i /></span></> : '开始分析'}
                </Button>
                <Button variant="outline" onClick={(e) => { spawnBubbles(e); setInput(DEMO_INPUT) }}>载入示例</Button>
                <Button variant="outline" disabled={ocrLoading} aria-label="上传截图识别文字" onClick={(e) => { spawnBubbles(e); fileRef.current?.click() }}>
                  {ocrLoading ? <>识别中<span className="loading-dots"><i /><i /><i /></span></> : '📷 上传截图识别'}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
              </div>

              {/* 隐私提示条：锁图标 + 12–13px，颜色不过淡 */}
              <div className="flex items-start gap-2 rounded-[10px] border border-[rgba(190,140,90,.25)] bg-[#FFFBEB] px-3 py-2.5 text-[12.5px] text-[#57534E]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <span>聊天记录仅在你的电脑上本地分析，不会上传到任何服务器；截图识别使用 macOS 系统离线能力，图片不出本机。</span>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </CardContent>
          </Card>
        </section>

        {/* 【4】结果区（右栏）：2 列网格（手机/平板），≥1024px 4 列 */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-live="polite">

          {demoMode && (
            <div className="col-span-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              分析服务未启动，当前展示内置演示数据。启动后端：<code>cd eq-chat-assistant && uvicorn server.app:app --port 8000</code>
            </div>
          )}

          {/* 【5】空状态：插画占位 + 引导文案 */}
          {!result && !loading && (
            <div className="col-span-full card warm-card text-center py-16 px-6 text-muted-foreground rise-in">
              <span className="text-5xl block mb-3" aria-hidden>💬</span>
              <p className="text-sm">粘贴一段聊天记录，或点击「载入示例」，<br />我会帮你分析整段对话的情绪走向。</p>
            </div>
          )}

          {/* 【5】分析中：分阶段进度条 + 骨架屏 */}
          {loading && (
            <>
              <Card className="warm-card rise-in col-span-full">
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
              <div className="skeleton h-24 col-span-full" />
              <div className="skeleton h-40 col-span-2 row-span-2" />
              <div className="skeleton h-24" />
              <div className="skeleton h-24" />
              <div className="skeleton h-24" />
              <div className="skeleton h-24" />
              <div className="skeleton h-52 col-span-full" />
            </>
          )}

          {result && !loading && (
            <>
              {/* 【4a】结论横幅：图标 + 等级大字 + 一句话结论，风险浅色底 */}
              <div className={`col-span-full rounded-2xl px-6 py-5 flex flex-wrap items-center gap-4 shadow-[0_2px_8px_rgba(0,0,0,.06)] rise-in ${RISK_BANNER[result.risk.conflict_risk]}`} role="alert">
                <span className="w-12 h-12 rounded-full bg-white/65 flex items-center justify-center text-2xl shrink-0" aria-hidden>
                  {RISK_ICON[result.risk.conflict_risk]}
                </span>
                <span className="text-xl font-bold whitespace-nowrap">冲突风险：{RISK_LEVEL[result.risk.conflict_risk]}</span>
                <span className="text-sm lg:ml-auto lg:max-w-[55%]">
                  {result.risk.reason_codes.filter((c) => c !== 'no_strong_signal').length > 0
                    ? `预警信号：${result.risk.reason_codes.filter((c) => c !== 'no_strong_signal').map((c) => REASON_ZH[c] ?? c).join('；')}。`
                    : '未检测到明显预警信号。'}
                  该结论由启发式规则估算，未经人工校准，仅供参考。
                </span>
              </div>

              {/* 【4b】指标网格：风险大卡 2×2 + 4 张小卡 */}
              <Card className="warm-card rise-in col-span-2 lg:row-span-2 flex flex-col justify-center">
                <CardContent className="pt-5 space-y-2">
                  <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[15px] font-bold w-fit ${RISK_BANNER[result.risk.conflict_risk]} ${result.risk.conflict_risk !== 'low' ? 'pulse-glow' : 'pulse-glow-warm'}`}>
                    <span aria-hidden>{RISK_ICON[result.risk.conflict_risk]}</span>{RISK_ZH[result.risk.conflict_risk]}
                  </span>
                  <div className="text-[40px] font-bold num-pop">{RISK_LEVEL[result.risk.conflict_risk]}</div>
                  <p className="text-[13px] text-muted-foreground">由情绪趋势启发式规则估算，阈值未经人工校准，仅供参考</p>
                </CardContent>
              </Card>

              <MetricCard icon="📈" name="情绪走势" tip="整段对话负向情绪的斜率方向：上升 / 平稳 / 下降。" value={TREND_ZH[result.risk.trend]} caption="基于逐轮负向概率拟合" />
              <MetricCard icon="🔄" name="情绪翻转点" tip="情绪极性发生正负切换的轮次数量，翻转越多说明对话越不稳定。" value={String(result.metrics.polarity_flips)} caption="正负切换的次数" delay=".06s" />
              <MetricCard icon="⛓️" name="最长连续负向" tip="连续保持负向情绪的最长轮数，是冲突积累的信号之一。" value={`${result.metrics.max_negative_streak} 轮`} caption="负向情绪最长持续长度" delay=".12s" />
              <MetricCard icon="🌡️" name="情绪波动幅度" tip="相邻轮次情绪分值变化的标准差，0–1 之间，越大说明情绪越起伏。" value={result.metrics.volatility.toFixed(2)} caption="逐轮情绪分值的标准差" delay=".18s" />

              {/* 【4c】情绪时间线卡片：整行宽度 */}
              <Card className="warm-card rise-in col-span-full" style={{ animationDelay: '.08s' }}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">情绪时间线</CardTitle>
                  <p className="text-[13px] text-muted-foreground">蓝线=情绪走向（左轴，仅展示用）；红线=负面情绪概率（右轴）；橙色点=低置信度轮次</p>
                </CardHeader>
                <CardContent>
                  <EmotionTimeline turns={result.turns} />
                </CardContent>
              </Card>

              {/* 逐轮明细（整行） */}
              <Card className="warm-card rise-in col-span-full" style={{ animationDelay: '.14s' }}>
                <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">🔎 逐轮情绪明细</CardTitle></CardHeader>
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

              {/* 【4d】回复建议区（整行，内部草稿三卡并排） */}
              <div className="col-span-full">
                <SuggestionsPanel suggestions={result.suggestions} llmStatus={result.llm_status} llmMessage={result.llm_message} />
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
