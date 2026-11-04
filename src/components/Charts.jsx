import { useId, useState } from 'react'
import { MONTHS, money } from '../lib/format'

const parseDay = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/* ---------------- Earning Overview — soft columns, one lit in orange ---------------- */
export function EarningBars({ values, selected, onSelect, max = 100 }) {
  const [hover, setHover] = useState(null)
  const hot = hover ?? selected
  const ticks = [100, 80, 60, 40, 20, 0]

  return (
    <div className="eb">
      <div className="eb-axis">
        {ticks.map((t, i) => (
          <span key={t} className="rv" style={{ bottom: `${(t / max) * 100}%`, '--i': 2 + i * 0.3 }}>
            {t}k
          </span>
        ))}
      </div>
      <div className="eb-plot" onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <i key={t} className="eb-grid" style={{ bottom: `${(t / max) * 100}%`, '--i': i }} />
        ))}
        {values.map((v, i) => (
          <button
            key={MONTHS[i]}
            type="button"
            className={`eb-col ${hot === i ? 'hot' : ''}`}
            style={{ '--i': i, '--h': `${(v / max) * 100}%` }}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => onSelect(i)}
            aria-label={`${MONTHS[i]}: $${v}k`}
            aria-pressed={selected === i}
          >
            <span className="eb-bar" />
            {hot === i ? <span className={`eb-label ${hover == null ? 'boot' : ''}`}>{v}k</span> : null}
          </button>
        ))}
      </div>
      <div className="eb-months">
        {MONTHS.map((m, i) => (
          <span key={m} className={`rv ${hot === i ? 'hot' : ''}`} style={{ '--i': 3 + i * 0.25 }}>
            {m}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Smooth line chart ---------------- */
const smooth = (pts) => {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const t = 0.18
    d += ` C ${p1[0] + (p2[0] - p0[0]) * t} ${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t} ${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]} ${p2[1]}`
  }
  return d
}

const niceMax = (v) => {
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  return Math.ceil((v * 1.1) / p) * p
}

export function LineChart({ labels, series, height = 240, unit = 'k' }) {
  const [hover, setHover] = useState(null)
  const gid = useId().replace(/:/g, '')
  const W = 1000
  const H = height
  const top = 12
  const bottom = 6
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)))
  const n = labels.length
  const x = (i) => (i / (n - 1)) * W
  const y = (v) => top + (1 - v / max) * (H - top - bottom)
  const shown = series.filter((s) => !s.hidden)

  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => [x(i), y(v)])
    const d = smooth(pts)
    return { ...s, d, area: `${d} L ${W} ${H} L 0 ${H} Z` }
  })

  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div className="line-chart">
      <div className="lc-axis">
        {[1, 0.75, 0.5, 0.25, 0].map((f) => (
          <span key={f} style={{ top: `${(y(max * f) / H) * 100}%` }}>
            {Math.round(max * f)}
            {f ? unit : ''}
          </span>
        ))}
      </div>
      <div className="lc-plot" style={{ height: H }} onMouseMove={move} onMouseLeave={() => setHover(null)}>
        {[1, 0.75, 0.5, 0.25, 0].map((f) => (
          <i key={f} className="lc-grid" style={{ top: `${(y(max * f) / H) * 100}%` }} />
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
          <defs>
            {lines.map((l, i) => (
              <linearGradient key={l.name} id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={l.color} stopOpacity=".24" />
                <stop offset="1" stopColor={l.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {lines.map((l, i) =>
            l.fill ? <path key={`a-${l.name}`} className={`lc-area ${l.hidden ? 'gone' : ''}`} d={l.area} fill={`url(#${gid}-${i})`} /> : null,
          )}
          {lines.map((l, i) => (
            <path
              key={l.name}
              className={`lc-line ${l.hidden ? 'gone' : ''}`}
              d={l.d}
              pathLength="1"
              fill="none"
              stroke={l.color}
              strokeWidth="2.6"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              style={{ '--i': i }}
            />
          ))}
        </svg>
        {hover != null && shown.length ? (
          <>
            <i className="lc-cursor" style={{ left: `${(hover / (n - 1)) * 100}%` }} />
            {shown.map((l) => (
              <i
                key={l.name}
                className="lc-dot"
                style={{ left: `${(hover / (n - 1)) * 100}%`, top: `${(y(l.values[hover]) / H) * 100}%`, '--c': l.color }}
              />
            ))}
            <div
              className={`chart-tip lc-tip ${hover > n * 0.6 ? 'left' : ''}`}
              style={{ left: `${(hover / (n - 1)) * 100}%`, top: `${(Math.min(...shown.map((l) => y(l.values[hover]))) / H) * 100}%` }}
            >
              <b>{labels[hover]}</b>
              {shown.map((l) => (
                <span key={l.name}>
                  <i className="sw" style={{ background: l.color }} />
                  {l.name}
                  <strong>
                    ${l.values[hover].toFixed(1)}
                    {unit}
                  </strong>
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <div className="lc-labels">
        {labels.map((lb, i) => (
          <span key={lb} className={hover === i ? 'hot' : ''}>
            {lb}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Donut ---------------- */
export function Donut({ data, colors, size = 200, stroke = 26, active, onActive, children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const total = data.reduce((s, d) => s + d.v, 0)
  const gap = 4
  const segs = data.map((d, i) => ({
    ...d,
    i,
    len: (d.v / total) * c,
    before: data.slice(0, i).reduce((s, x) => s + (x.v / total) * c, 0),
  }))
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--soft)" strokeWidth={stroke} />
        {segs.map(({ name, i, len, before: b }) => (
          <circle
            key={name}
            className={`donut-seg ${active != null && active !== i ? 'dim' : ''}`}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colors[i % colors.length]}
            strokeWidth={active === i ? stroke + 8 : stroke}
            strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
            strokeDashoffset={-b}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ '--i': i, '--c': c }}
            onMouseEnter={() => onActive?.(i)}
            onMouseLeave={() => onActive?.(null)}
          />
        ))}
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  )
}

/* ---------------- Daily spending heatmap ---------------- */
const level = (d) => {
  if (d.future) return 'future'
  if (!d.amt) return 'l0'
  if (d.amt < 70) return 'l1'
  if (d.amt < 150) return 'l2'
  if (d.amt < 250) return 'l3'
  return 'l4'
}

export function Heatmap({ weeks }) {
  const [tip, setTip] = useState(null)
  const months = []
  weeks.forEach((w, c) => {
    const m = parseDay(w[0].date).getMonth()
    if (c === 0 || m !== parseDay(weeks[c - 1][0].date).getMonth()) months.push({ label: MONTHS[m], col: c })
  })
  const labels = months.filter((m, i) => !months[i + 1] || months[i + 1].col - m.col >= 3)

  return (
    <div className="hm">
      <div className="hm-inner">
        <div className="hm-months">
          {labels.map((m) => (
            <span key={`${m.label}-${m.col}`} style={{ left: `${(m.col / weeks.length) * 100}%` }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="hm-days">
          {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="hm-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }} onMouseLeave={() => setTip(null)}>
          {weeks.map((w, c) =>
            w.map((d, r) => (
              <i
                key={d.date}
                className={`hm-cell ${level(d)}`}
                style={{ '--c': c, '--r': r }}
                onMouseEnter={() => (d.future ? setTip(null) : setTip({ c, r, d }))}
              />
            )),
          )}
          {tip ? (
            <div className="chart-tip hm-tip" style={{ left: `${((tip.c + 0.5) / weeks.length) * 100}%`, top: `${(tip.r / 7) * 100}%` }}>
              <b>
                {MONTHS[parseDay(tip.d.date).getMonth()]} {parseDay(tip.d.date).getDate()}, {parseDay(tip.d.date).getFullYear()}
              </b>
              <span>{tip.d.amt ? `${money(tip.d.amt)} spent` : 'No-spend day 🎉'}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ---------------- Sparkline ---------------- */
export function Sparkline({ values, color = 'var(--accent)' }) {
  const gid = useId().replace(/:/g, '')
  const W = 200
  const H = 64
  const max = Math.max(...values)
  const min = Math.min(...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 8 - ((v - min) / (max - min || 1)) * (H - 20)])
  const d = smooth(pts)
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".26" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="ar" d={`${d} L ${W} ${H} L 0 ${H} Z`} fill={`url(#${gid})`} />
      <path
        className="ln"
        d={d}
        pathLength="1"
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  )
}
