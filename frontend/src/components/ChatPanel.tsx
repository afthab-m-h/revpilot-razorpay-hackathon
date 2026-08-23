import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { ChatResponse, GeminiUsage } from '../types'

interface Msg {
  role: 'user' | 'agent'
  content: string
  trace?: string[]
}

function UsageIndicator({ usage }: { usage: GeminiUsage | null }) {
  const [remainingSecs, setRemainingSecs] = useState<number | null>(null)

  useEffect(() => {
    if (!usage?.reset_in_seconds) {
      setRemainingSecs(null)
      return
    }
    setRemainingSecs(Math.ceil(usage.reset_in_seconds))
    const t = setInterval(() => {
      setRemainingSecs((s) => (s === null ? null : Math.max(s - 1, 0)))
    }, 1000)
    return () => clearInterval(t)
  }, [usage?.reset_at])

  if (!usage?.visible) return null

  let text: string
  if (usage.requests_limit != null) {
    text = `AI usage: ${usage.requests_used}/${usage.requests_limit}`
    if (usage.limited) {
      text += remainingSecs && remainingSecs > 0
        ? ` · resets in ${remainingSecs}s`
        : ' · Rate limit active'
    }
  } else {
    text = 'Rate limit active'
  }

  return (
    <p className={`px-5 py-2 border-t border-line font-mono text-[10px] uppercase tracking-[0.16em] ${
      usage.limited ? 'text-accent' : 'text-inkMute'
    }`}>
      {text}
    </p>
  )
}

export default function ChatPanel({ onRecommend }: { onRecommend?: (productName: string) => void }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'agent',
      content:
        'I\'m your StrideX shopping agent. Tell me what you\'re training for and your budget — I\'ll find the right gear.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [usage, setUsage] = useState<GeminiUsage | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchUsage = () =>
    api.get<GeminiUsage>('/api/agent/usage').then(setUsage).catch(() => setUsage(null))

  useEffect(() => {
    fetchUsage()
    const t = setInterval(fetchUsage, 15000) // keeps status fresh; server decides visibility
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send(text: string) {
    const clean = text.trim()
    if (!clean || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: clean }])
    setBusy(true)
    try {
      const res = await api.post<ChatResponse>('/api/agent/chat', { message: clean })
      setMessages((m) => [
        ...m,
        { role: 'agent', content: res.reply, trace: res.trace.map((t) => t.message) },
      ])
      const mentioned = ['Speed Pro', 'Run Lite', 'Socks', 'Gel', 'Watch'].find((n) => res.reply.includes(n))
      if (mentioned) onRecommend?.(mentioned)
      fetchUsage()
    } catch (e) {
      setMessages((m) => [...m, { role: 'agent', content: `Something went wrong: ${(e as Error).message}` }])
      fetchUsage()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card flex flex-col h-[640px] sticky top-24">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <div>
          <p className="label">AI Shopping Agent</p>
          <p className="text-xs text-inkMute mt-0.5">Tool-calling · live catalog</p>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-inkMute">
          <span className={`w-1.5 h-1.5 rounded-full ${busy ? 'bg-accent animate-pulse' : 'bg-emerald-500'}`} />
          {busy ? 'Thinking' : 'Online'}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {messages.map((m, i) => (
          <div key={i} className={`animate-fadeUp ${m.role === 'user' ? 'pl-10' : ''}`}>
            <p className="label mb-1.5">{m.role === 'user' ? 'You' : 'Agent'}</p>
            <div
              className={`text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'border-l-2 border-accent pl-4 text-ink'
                  : 'border-l-2 border-line pl-4 text-inkMute'
              }`}
            >
              {m.content}
            </div>
            {m.trace && m.trace.length > 0 && (
              <details className="mt-2 ml-4 group">
                <summary className="label cursor-pointer hover:text-accent select-none">
                  Agent activity ({m.trace.length})
                </summary>
                <div className="mt-2 space-y-1 border-l border-dashed border-line pl-3">
                  {m.trace.map((t, j) => (
                    <p key={j} className="font-mono text-[11px] text-inkMute">
                      {String(j + 1).padStart(2, '0')} · {t}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </div>
        ))}
        {busy && (
          <div className="animate-fadeIn">
            <p className="label mb-1.5">Agent</p>
            <div className="border-l-2 border-accent pl-4 space-y-1.5">
              <div className="h-2 w-40 bg-line animate-pulse" />
              <div className="h-2 w-28 bg-line animate-pulse" />
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input) }}
        className="border-t border-line"
      >
        <UsageIndicator usage={usage} />
        <div className="p-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. half marathon under ₹5000"
            className="input"
          />
          <button className="btn-primary shrink-0" disabled={busy || !input.trim()}>Send</button>
        </div>
      </form>
    </div>
  )
}
