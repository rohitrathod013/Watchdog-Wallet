import Icon from '../components/Icon'
import { Sparkline } from '../components/Charts'
import { Chg, CountUp } from '../components/ui'
import { useApp, useLead } from '../lib/store'
import { saveFile, whole } from '../lib/format'
import { INCOME_SOURCES, REPORTS } from '../data/seed'
import { BRAND } from '../config'

const SRC_COLORS = ['var(--solid)', 'var(--green)', 'var(--accent)']

export default function ReportsView({ attached = true }) {
  const { toast } = useApp()
  const lead = useLead()
  const total = INCOME_SOURCES.reduce((s, x) => s + x.value, 0)

  const download = (r) => {
    const lines = [`${BRAND.name} — ${r.title} (${r.q})`, `Generated,${r.date}`, '', 'Period,Index']
    r.bars.forEach((v, i) => lines.push(`P${i + 1},${v}`))
    saveFile(
      `${BRAND.name.toLowerCase().replace(/\s+/g, '-')}-${r.q.toLowerCase().replace(/\s+/g, '-')}-${r.title.toLowerCase().replace(/\s+/g, '-')}.csv`,
      lines.join('\n'),
      'text/csv',
    )
    toast('Report downloaded', `${r.q} ${r.title} saved to your device.`, { icon: 'download' })
  }

  return (
    <>
      <section className={`card income-src ${attached ? 'attached' : ''}`} style={{ '--d': '0ms' }}>
        <div className="c-head rv" style={{ '--i': 0 }}>
          <div>
            <h2 className="card-h">Total Income Overview</h2>
            <p className="card-sub">Year to date, across every income stream</p>
          </div>
          <Chg value={18.6} note="vs 2025" />
        </div>
        <div className="src-total rv" style={{ '--i': 1 }}>
          <strong>
            <CountUp value={total} format={(n) => whole(n)} delay={lead + 150} duration={1700} />
          </strong>
          <span className="muted">earned in 2026</span>
        </div>
        <div className="stacked rv" style={{ '--i': 2, height: 16, marginTop: 18 }}>
          {INCOME_SOURCES.map((s, i) => (
            <i key={s.id} style={{ '--w': s.value, '--c': SRC_COLORS[i], '--i': i }} />
          ))}
        </div>
        <div className="src-tiles">
          {INCOME_SOURCES.map((s, i) => (
            <div key={s.id} className="src-tile" style={{ '--i': i }}>
              <small>
                <i className="sw" style={{ background: SRC_COLORS[i], borderRadius: '50%' }} />
                {s.name}
              </small>
              <b>
                <CountUp value={s.value} format={(n) => whole(n)} delay={lead + 300 + i * 100} />
              </b>
              <em>{Math.round((s.value / total) * 100)}% of income</em>
              <Sparkline values={s.trend} color={SRC_COLORS[i]} />
            </div>
          ))}
        </div>
      </section>

      <div className="grid-3">
        {REPORTS.map((r, i) => (
          <section key={r.id} className={`card report ${i % 3 === 1 ? 'dark' : ''}`} style={{ '--d': `${120 + i * 70}ms` }}>
            <div className="report-paper rv" style={{ '--i': 0 }}>
              <div className="paper-top">
                <span>{r.q}</span>
                <i />
              </div>
              <small>{r.title}</small>
              <div className="mini-bars">
                {r.bars.map((h, j) => (
                  <i key={j} style={{ '--h': `${h}%`, '--i': j }} />
                ))}
              </div>
            </div>
            <div className="report-meta rv" style={{ '--i': 1 }}>
              <div>
                <b>{r.title}</b>
                <small>
                  {r.date} · {r.size}
                </small>
              </div>
              <button type="button" className="btn tiny" onClick={() => download(r)}>
                <Icon name="download" size={15} />
                CSV
              </button>
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
