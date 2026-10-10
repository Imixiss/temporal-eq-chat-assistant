import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Suggestions } from '@/types'

interface Props {
  suggestions: Suggestions | null
  llmStatus: 'ok' | 'not_configured' | 'error'
  llmMessage?: string
}

export default function SuggestionsPanel({ suggestions, llmStatus, llmMessage }: Props) {
  if (!suggestions) {
    return (
      <Card className="warm-card border-dashed">
        <CardHeader><CardTitle className="text-base">💬 分析与回复建议</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          {llmStatus === 'error' ? (
            <p className="text-red-600">大模型调用失败：{llmMessage}</p>
          ) : (
            <>
              <p>此区域由大模型驱动，目前尚未接入。点击右上角「⚙ 大模型设置」填入 API Key 后，这里会输出：</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>局势分析：这段对话发生了什么、对方可能在想什么</li>
                <li>沟通建议：基于整段情绪趋势的下一步建议</li>
                <li>高情商回复草稿：2–3 条不同风格、可直接发送的话术</li>
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="warm-card rise-in">
        <CardHeader><CardTitle className="text-base">🔍 局势分析</CardTitle></CardHeader>
        <CardContent className="text-sm whitespace-pre-wrap">{suggestions.situation_analysis}</CardContent>
      </Card>
      <Card className="warm-card rise-in" style={{ animationDelay: '.08s' }}>
        <CardHeader><CardTitle className="text-base">🧭 沟通建议</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {suggestions.advice.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </CardContent>
      </Card>
      <Card className="warm-card rise-in" style={{ animationDelay: '.16s' }}>
        <CardHeader><CardTitle className="text-base">✉️ 回复草稿（点击复制）</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {suggestions.reply_drafts.map((d, i) => (
            <button
              key={i}
              className="block w-full text-left rounded-xl border border-[rgba(190,140,90,.25)] bg-white/60 p-3 hover:bg-[#FBE3CC]/60 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(184,110,50,.14)] transition-all"
              onClick={() => navigator.clipboard.writeText(d.text)}
            >
              <span className="text-xs font-medium text-muted-foreground">{d.style}</span>
              <p className="text-sm mt-1">{d.text}</p>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
