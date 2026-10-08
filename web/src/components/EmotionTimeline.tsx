import { ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { EMOTION_SCORE, EMOTION_ZH, NEGATIVE_EMOTIONS, type TurnAnalysis } from '@/types'

interface Props {
  turns: TurnAnalysis[]
}

export default function EmotionTimeline({ turns }: Props) {
  const data = turns.map((t) => ({
    turn: t.turn_id,
    score: EMOTION_SCORE[t.emotion] ?? 0,
    negProb: +NEGATIVE_EMOTIONS.reduce((s, e) => s + (t.probabilities[e] ?? 0), 0).toFixed(3),
    label: EMOTION_ZH[t.emotion] ?? t.emotion,
    speaker: t.speaker,
    confidence: t.confidence,
    lowConf: t.confidence < 0.5,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: -10 }}>
        <XAxis dataKey="turn" fontSize={12} label={{ value: '轮次', position: 'insideBottomRight', offset: -2 }} />
        <YAxis yAxisId="left" domain={[-1.1, 1.2]} fontSize={11} tickFormatter={(v) => v.toFixed(1)} />
        <YAxis yAxisId="right" orientation="right" domain={[0, 1]} fontSize={11} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <Tooltip
          formatter={(value: number, name: string) =>
            name === '情绪走向' ? value.toFixed(2) : `${(value * 100).toFixed(1)}%`
          }
          labelFormatter={(t) => {
            const d = data[Number(t)]
            return d ? `第 ${d.turn + 1} 轮 · ${d.speaker} · ${d.label}（置信度 ${(d.confidence * 100).toFixed(0)}%）` : t
          }}
        />
        <ReferenceLine yAxisId="left" y={0} stroke="#ddd" />
        <Line yAxisId="left" type="stepAfter" dataKey="score" name="情绪走向" stroke="#9BBBF4" strokeWidth={2} dot={false} />
        <Scatter
          yAxisId="left"
          dataKey="score"
          fill="#4A7FB5"
          shape={(props: { cx?: number; cy?: number; payload?: { lowConf?: boolean } }) => (
            <circle cx={props.cx} cy={props.cy} r={5}
              fill={props.payload?.lowConf ? '#F4C790' : '#4A7FB5'} />
          )}
        />
        <Line yAxisId="right" type="monotone" dataKey="negProb" name="负面情绪概率" stroke="#D9544D" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
