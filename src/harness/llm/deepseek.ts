import type { LlmProvider, ModelRequest } from './types.ts'

interface StreamChoice {
  delta?: { content?: string }
}

/**
 * DeepSeek chat-completions provider: POSTs with `stream: true` and yields
 * `choices[0].delta.content` as SSE `data:` lines arrive. Wire format is
 * validated here — the JSON boundary — and nowhere else.
 */
export class DeepSeekProvider implements LlmProvider {
  readonly name = 'deepseek'

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.deepseek.com',
    private readonly defaultModel = 'deepseek-chat',
  ) {}

  async *stream(request: ModelRequest): AsyncIterable<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model ?? this.defaultModel,
        messages: request.messages,
        stream: true,
      }),
    })
    if (!response.ok) {
      throw new Error(`deepseek: HTTP ${response.status}: ${await response.text()}`)
    }
    if (response.body === null) {
      throw new Error('deepseek: empty response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') return
        const parsed = JSON.parse(data) as { choices?: StreamChoice[] }
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta !== undefined && delta !== '') yield delta
      }
    }
  }
}
