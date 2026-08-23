import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { AgentRun, AuditEntry } from '../../types'

export default function Audit() {
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [actorFilter, setActorFilter] = useState<string | null>(null)
  const [tab, setTab] = useState<'audit' | 'agents'>('audit')

  const load = useCallback(() => {
    const qs = actorFilter ? `&actor=${actorFilter}` : ''
    api.get<AuditEntry[]>(`/api/audit?limit=100${qs}`).then(setAudit).catch(() => {})
    api.get<AgentRun[]>('/api/agent/activity?limit=15').then(setRuns).catch(() => {})
  }, [actorFilter])
  useEffect(load, [load])

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-6 border-b border-line flex-1 min-w-[240px]">
          {(['audit', 'agents'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`font-mono text-[11px] uppercase tracking-[0.18em] pb-3 -mb-px border-b-2 transition-colors ${
                tab === t ? 'border-accent text-ink' : 'border-transparent text-inkMute hover:text-ink'
              }`}
            >
              {t === 'audit' ? 'Financial audit log' : 'Agent activity'}
            </button>
          ))}
        </div>
        {tab === 'audit' && (
          <div className="flex gap-2">
            {[null, 'ai_revenue_agent', 'policy_engine', 'payment_gateway', 'merchant', 'system'].map((a) => (
              <button
                key={a ?? 'all'}
                onClick={() => setActorFilter(a)}
                className={`font-mono text-[10px] uppercase tracking-widest border px-3 py-1.5 transition-all ${
                  actorFilter === a ? 'border-accent text-accent' : 'border-line text-inkMute hover:text-ink'
                }`}
              >
                {a?.replace('_', ' ') ?? 'All actors'}
              </button>
            ))}
          </div>
        )}
        <button onClick={load} className="btn-ghost !py-2">Refresh</button>
      </div>

      {tab === 'audit' ? (
        <div className="card divide-y divide-line">
          {audit.map((a) => {
            const blocked = a.policy_status === 'blocked' || (a.execution_status ?? '').includes('failed')
            return (
              <div key={a.id} className={`px-5 py-3.5 ${blocked ? 'bg-red-500/[0.04]' : ''}`}>
                <div className="flex items-center justify-between gap-4">
                  <p className="font-mono text-xs truncate">
                    <span className="text-inkMute">{new Date(a.timestamp).toLocaleString('en-IN', { timeStyle: 'medium' })}</span>{' '}
                    <span className="font-medium">{a.action}</span>
                  </p>
                  <span className={`font-mono text-[10px] uppercase tracking-widest shrink-0 ${
                    blocked || a.execution_status === 'rejected' ? 'text-red-500' : 'text-inkMute'
                  }`}>
                    {[a.policy_status, a.approval_status !== 'n/a' ? a.approval_status : null, a.execution_status]
                      .filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-inkMute mt-1">
                  {a.actor}{a.entity_type ? ` → ${a.entity_type}` : ''}{a.entity_id ? ` ${a.entity_id}` : ''}
                </p>
                {a.reason && <p className="text-xs text-inkMute mt-1 leading-relaxed">{a.reason}</p>}
              </div>
            )
          })}
          {audit.length === 0 && <p className="text-sm text-inkMute p-6">No audit entries for this filter.</p>}
        </div>
      ) : (
        <div className="space-y-5">
          {runs.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <p className="label mb-1">{r.agent_type.replace('_', ' ')}</p>
                  <p className="text-sm font-medium truncate">"{r.input}"</p>
                </div>
                <span className="font-mono text-[10px] text-inkMute shrink-0">
                  {new Date(r.created_at).toLocaleTimeString('en-IN')}
                </span>
              </div>
              <div className="mt-3 border-l border-dashed border-line pl-4 space-y-1">
                {(r.trace ?? []).map((t, j) => (
                  <p key={j} className="font-mono text-[11px] text-inkMute">
                    {String(j + 1).padStart(2, '0')} · {typeof t === 'string' ? t : t.message}
                  </p>
                ))}
              </div>
              {(r.tools_used ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {[...new Set(r.tools_used)].map((t) => (
                    <span key={t} className="font-mono text-[10px] border border-line px-2 py-0.5 text-inkMute">{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {runs.length === 0 && <p className="text-sm text-inkMute">No agent runs recorded yet.</p>}
        </div>
      )}
    </div>
  )
}
