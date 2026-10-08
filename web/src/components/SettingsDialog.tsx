import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LLM_PROVIDERS, type LlmSettings } from '@/types'

interface Props {
  settings: LlmSettings
  onSave: (s: LlmSettings) => void
}

export default function SettingsDialog({ settings, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<LlmSettings>(settings)

  const pickProvider = (p: string) => {
    const preset = LLM_PROVIDERS[p]
    setDraft({ ...draft, provider: p, baseUrl: preset.baseUrl, model: preset.model })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">⚙ 大模型设置</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>接入大模型（LLM）</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            「局势分析 / 沟通建议 / 回复草稿」由大模型生成。填入 API Key 后即刻启用；
            Key 只保存在你的浏览器本地，随请求转发给后端做代理调用，不会落盘。
          </p>
          <div className="space-y-2">
            <Label>服务商</Label>
            <Select value={draft.provider} onValueChange={pickProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(LLM_PROVIDERS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              placeholder="sk-..."
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value.trim() })}
            />
          </div>
          <div className="space-y-2">
            <Label>接口地址（Base URL）</Label>
            <Input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value.trim() })} />
          </div>
          <div className="space-y-2">
            <Label>模型</Label>
            <Input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value.trim() })} />
          </div>
          <Button
            className="w-full"
            onClick={() => { onSave(draft); setOpen(false) }}
          >
            保存
          </Button>
          <p className="text-xs text-muted-foreground">
            没有 Key？注册 DeepSeek 或 Kimi 开放平台即可获得，新用户通常有免费额度。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
