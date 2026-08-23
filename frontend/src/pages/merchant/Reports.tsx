import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx'
import { api } from '../../lib/api'
import type { AuditEntry, Offer, Order, Opportunity, Product, RevenueSummary } from '../../types'

type Dataset = 'sales' | 'inventory' | 'opportunities' | 'audit'

const DATASETS: { id: Dataset; label: string; desc: string }[] = [
  { id: 'sales', label: 'Sales report', desc: 'Orders, amounts, payment status' },
  { id: 'inventory', label: 'Inventory report', desc: 'Catalog, pricing, stock levels' },
  { id: 'opportunities', label: 'AI opportunities', desc: 'Detected revenue opportunities & offers' },
  { id: 'audit', label: 'Audit log', desc: 'Every agent, policy and money action' },
]

interface ReportRow {
  [key: string]: string | number
}

async function buildRows(dataset: Dataset): Promise<ReportRow[]> {
  if (dataset === 'sales') {
    const [orders, summary] = await Promise.all([
      api.get<Order[]>('/api/orders?limit=500'),
      api.get<RevenueSummary>('/api/analytics/summary'),
    ])
    const rows: ReportRow[] = orders.map((o) => ({
      order_id: o.id,
      date: new Date(o.created_at).toISOString(),
      customer_id: o.customer_id ?? '',
      items: (o.items ?? []).map((i) => `${i.product_name ?? i.product_id} x${i.quantity}`).join('; '),
      amount_inr: o.amount / 100,
      status: o.status,
      ai_assisted: o.ai_assisted ? 'yes' : 'no',
    }))
    rows.push({}) // blank separator row
    rows.push({ order_id: 'TOTAL REVENUE (paid)', date: '', customer_id: '', items: '', amount_inr: summary.revenue_rupees, status: `${summary.orders} paid orders`, ai_assisted: '' })
    return rows
  }
  if (dataset === 'inventory') {
    const products = await api.get<Product[]>('/api/products?limit=500')
    return products.map((p) => ({
      product_id: p.id,
      name: p.name,
      category: p.category,
      price_inr: p.price / 100,
      stock: p.stock,
      rating: p.rating,
      tags: p.tags.join(', '),
    }))
  }
  if (dataset === 'opportunities') {
    const [opps, offers] = await Promise.all([
      api.get<Opportunity[]>('/api/analytics/opportunities?refresh=true'),
      api.get<Offer[]>('/api/offers'),
    ])
    const rows: ReportRow[] = opps.map((o) => ({
      kind: `OPPORTUNITY · ${o.type}`,
      title: o.title,
      confidence_percent: Math.round(o.confidence * 100),
      detail: o.reason ?? '',
      status: o.status,
    }))
    for (const f of offers) {
      rows.push({ kind: `OFFER · ${f.status}`, title: f.name, confidence_percent: f.discount_value, detail: f.reason ?? '', status: f.approval_status ?? f.policy_status ?? '' })
    }
    return rows
  }
  const audit = await api.get<AuditEntry[]>('/api/audit?limit=300')
  return audit.map((a) => ({
    timestamp: new Date(a.timestamp).toISOString(),
    actor: a.actor,
    action: a.action,
    entity: a.entity_id ?? '',
    policy_status: a.policy_status ?? '',
    approval_status: a.approval_status ?? '',
    execution_status: a.execution_status ?? '',
    reason: a.reason ?? '',
  }))
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function toCSV(rows: ReportRow[]): string {
  if (!rows.length) return ''
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(Boolean)
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  return [headers.join(','), ...rows.filter((r) => Object.keys(r).length).map((r) => headers.map((h) => esc(r[h] ?? '')).join(','))].join('\n')
}

export default function Reports() {
  const [dataset, setDataset] = useState<Dataset>('sales')
  const [busy, setBusy] = useState<string | null>(null)

  async function exportReport(format: 'csv' | 'xlsx' | 'pdf' | 'docx') {
    setBusy(format)
    try {
      const rows = await buildRows(dataset)
      const stamp = new Date().toISOString().slice(0, 10)
      const name = `revpilot_${dataset}_${stamp}`

      if (format === 'csv') {
        download(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`)
      } else if (format === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(rows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, dataset)
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
        download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`)
      } else if (format === 'pdf') {
        const doc = new jsPDF()
        doc.setFontSize(18)
        doc.text(`RevPilot — ${dataset.toUpperCase()} report`, 14, 20)
        doc.setFontSize(9)
        doc.setTextColor(120)
        doc.text(`Generated ${new Date().toLocaleString('en-IN')} · simulated data · revpilot.local`, 14, 27)
        const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(Boolean)
        autoTable(doc, {
          startY: 32,
          head: [headers],
          body: rows.map((r) => headers.map((h) => String(r[h] ?? '').slice(0, 40))),
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: { fillColor: [20, 20, 20] },
          theme: 'grid',
        })
        doc.save(`${name}.pdf`)
      } else {
        const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(Boolean)
        const table = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: headers.map(
                (h) =>
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })],
                  }),
              ),
            }),
            ...rows.map(
              (r) =>
                new TableRow({
                  children: headers.map(
                    (h) =>
                      new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: String(r[h] ?? ''), size: 16 })] })],
                      }),
                  ),
                }),
            ),
          ],
        })
        const doc = new Document({
          sections: [{
            children: [
              new Paragraph({ text: `RevPilot — ${dataset.toUpperCase()} report`, heading: HeadingLevel.HEADING_1 }),
              new Paragraph({
                children: [new TextRun({ text: `Generated ${new Date().toLocaleString('en-IN')} · simulated/test data`, italics: true, color: '888888' })],
              }),
              table,
            ],
          }],
        })
        download(await Packer.toBlob(doc), `${name}.docx`)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-3xl space-y-10 animate-fadeIn">
      <div>
        <h2 className="font-display font-semibold text-2xl tracking-tight mb-6">1 · Choose dataset</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {DATASETS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDataset(d.id)}
              className={`card text-left p-5 transition-all duration-200 hover:border-ink ${
                dataset === d.id ? 'border-accent' : ''
              }`}
            >
              <p className="font-display font-semibold">{d.label}</p>
              <p className="text-sm text-inkMute mt-1.5">{d.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-tight mb-6">2 · Choose format</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(['csv', 'xlsx', 'pdf', 'docx'] as const).map((f) => (
            <button
              key={f}
              onClick={() => exportReport(f)}
              disabled={busy !== null}
              className="card group py-8 flex flex-col items-center gap-3 hover:border-accent transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
            >
              <span className="font-display font-bold text-2xl uppercase tracking-tighter">{f}</span>
              <span className="label">{busy === f ? 'Generating…' : 'Download'}</span>
            </button>
          ))}
        </div>
        <p className="label mt-6">Reports are generated from live API data and clearly labelled as simulated/test.</p>
      </div>
    </div>
  )
}
