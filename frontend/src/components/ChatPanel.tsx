import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../lib/api'
import type { ChatResponse, GeminiUsage } from '../types'

interface Msg {
  role: 'user' | 'agent'
  content: string
  trace?: string[]
}

/* ---------- lightweight shopping-domain guardrail (frontend-only) ---------- */

const SHOPPING_RE =
  /\b(sho(e|es)|sneaker|sock|watch|bottle|gel|short|sleeve|roller|gear|apparel|clothing|product|catalog(ue)?|stock|price|priced|discount|offer|bundle|deal|sale|cart|checkout|order|orders|buy|purchas\w*|return|refund|exchange|shipping|delivery|policy|warranty|size|sizing|recommend\w*|running|run|marathon|half.marathon|racing|trainer|training|fitness|gym|workout|yoga|sport\w*|athlet\w*|nutrition|recover\w*|hydrat\w*|compress\w*|gps|budget|afford|rupee|rs\b|inr|₹|\d+\s*(k|k? rupees))\b/i

const GREETING_RE = /^\s*(hi|hii+|hey+|hello+|yo|good\s*(morning|afternoon|evening)|namaste)[!. ]*$/i

function isShoppingRelated(text: string): boolean {
  if (GREETING_RE.test(text)) return true          // greetings pass through to the agent
  return SHOPPING_RE.test(text)
}

const REDIRECT_MSG =
  "I'm your StrideX shopping assistant — I can help you find running and fitness gear, compare products, check prices, build bundles, and complete your checkout.\n\nWhat are you training for?"

/* ------------------------------ markdown view ------------------------------ */

const mdClass = {
  p: 'my-2 first:mt-0 last:mb-0',
  h1: 'font-display font-semibold text-base mt-3 mb-1.5',
  h2: 'font-display font-semibold text-[15px] mt-3 mb-1.5',
  h3: 'font-display font-semibold text-sm mt-3 mb-1',
  ul: 'list-disc pl-5 my-2 space-y-1',
  ol: 'list-decimal pl-5 my-2 space-y-1',
  li: 'leading-relaxed',
  strong: 'font-semibold text-ink',
  a: 'text-accent underline',
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed [&_code]:font-mono [&_code]:text-[12px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className={mdClass.p}>{children}</p>,
          h1: ({ children }) => <h1 className={mdClass.h1}>{children}</h1>,
          h2: ({ children }) => <h2 className={mdClass.h2}>{children}</h2>,
          h3: ({ children }) => <h3 className={mdClass.h3}>{children}</h3>,
          h4: ({ children }) => <h4 className={mdClass.h3}>{children}</h4>,
          ul: ({ children }) => <ul className={mdClass.ul}>{children}</ul>,
          ol: ({ children }) => <ol className={mdClass.ol}>{children}</ol>,
          li: ({ children }) => <li className={mdClass.li}>{children}</li>,
          strong: ({ children }) => <strong className={mdClass.strong}>{children}</strong>,
          a: ({ children, href }) => <a href={href} className={mdClass.a}>{children}</a>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-line pl-3 my-2 text-inkMute">{children}</blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className || '')
            if (isBlock) return <code className="block bg-paper border border-line p-3 my-2 whitespace-pre-wrap" {...props}>{children}</code>
            return <code className="bg-paper border border-line px-1 py-0.5" {...props}>{children}</code>
          },
          pre: ({ children }) => <pre className="my-2 overflow-x-auto">{children}</pre>,
          hr: () => <hr className="border-line my-3" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
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

  const calls = usage.requests_used ?? 0
  const plural = calls === 1 ? '' : 'S'
  let text: string
  if (usage.limited && usage.requests_limit != null) {
    // Server confirmed the window quota is exhausted — show quota state,
    // NOT local call count (local calls != server bucket).
    text = `AI QUOTA · ${usage.requests_limit}/${usage.requests_limit} · RATE LIMITED`
  } else if (usage.requests_limit != null) {
    text = `AI USAGE · ${calls} CALL${plural} THIS WINDOW · QUOTA ${usage.requests_limit}/MIN`
  } else {
    // Local count only; server quota unknown.
    text = `AI USAGE · ${calls} CALL${plural} THIS SESSION`
  }

  // Accurate countdown only when the provider actually gave a retry delay.
  const retry =
    usage.limited && remainingSecs !== null && remainingSecs > 0 ? ` · RETRY IN ${remainingSecs}s` : ''

  return (
    <p className={`px-5 py-2 border-t border-line font-mono text-[10px] uppercase tracking-[0.16em] ${
      usage.limited ? 'text-accent' : 'text-inkMute'
    }`}>
      {text}{retry}
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

    // Shopping-domain guardrail: politely redirect off-topic requests without
    // calling the agent (no tool-calling or recommendation logic is changed).
    if (!isShoppingRelated(clean)) {
      setMessages((m) => [...m, { role: 'agent', content: REDIRECT_MSG }])
      return
    }

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
              className={`${
                m.role === 'user'
                  ? 'border-l-2 border-accent pl-4 text-sm leading-relaxed text-ink whitespace-pre-wrap'
                  : 'border-l-2 border-line pl-4 [&_p]:text-inkMute [&_li]:text-inkMute [&_h1]:text-ink [&_h2]:text-ink [&_h3]:text-ink'
              }`}
            >
              {m.role === 'user' ? m.content : <Markdown content={m.content} />}
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
