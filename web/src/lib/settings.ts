import type { LlmSettings } from '@/types'

const KEY = 'eq-assistant-llm-settings'

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as LlmSettings
  } catch {
    /* ignore */
  }
  return { provider: 'kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3', apiKey: '' }
}

export function saveLlmSettings(s: LlmSettings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}
