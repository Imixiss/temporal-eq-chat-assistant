import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Suggestions } from '@/types'

interface Props {
  suggestions: Suggestions | null
  llmStatus: 'ok' | 'not_configured' | 'error' | 'budget_exceeded'
  llmMessage?: string
}

export default function SuggestionsPanel({ suggestions, llmStatus, llmMessage }: Props) {
  if (!suggestions) {
    return (
      <Card className="warm-card border-dashed">
        <CardHeader><CardTitle className="text-base font-semibold">💬 分析与回复建议</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          {llmStatus === 'error' ? (
            <p className="text-red-600">大模型调用失败：{llmMessage}</p>
          ) : llmStatus === 'budget_exceeded' ? (
            <p className="text-amber-700">💰 {llmMessage}</p>
          ) : (
            <>
              <p>此区域由大模型驱动，目前尚未接入。点击右上角「⚙ 设置」填入 API Key 后，这里会输出：</p>
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
      <div className="grid md:grid-cols-2 gap-4 items-start">
        <Card className="warm-card rise-in">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">🔍 局势分析</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{suggestions.situation_analysis}</CardContent>
        </Card>
        <Card className="warm-card rise-in" style={{ animationDelay: '.08s' }}>
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">🧭 沟通建议</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {suggestions.advice.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* 【4d】回复草稿：三张并排卡片（手机端纵向堆叠），点击复制 */}
      <div>
        <p className="text-base font-semibold mb-3">✉️ 回复草稿（点击卡片复制）</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {suggestions.reply_drafts.map((d, i) => (
            <button
              key={i}
              className="sg-card warm-card rise-in text-left"
              style={{ animationDelay: `${0.12 + i * 0.06}s` }}
              onClick={() => navigator.clipboard.writeText(d.text)}
              aria-label={`复制回复草稿：${d.style}`}
            >
              <span className="sg-style">{d.style}</span>
              <p className="text-sm leading-[1.7]">{d.text}</p>
              <span className="text-[12.5px] text-muted-foreground mt-3 inline-block">📋 点击复制</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
