import { Suspense, lazy, useLayoutEffect, useRef } from 'react'
import { Dropdown, PageHead, Stage } from '../components/ui'
import { useApp } from '../lib/store'
import { PERIOD_OPTIONS, TABS } from '../lib/routes'
import OverviewView from '../views/Overview'
import { t } from '../lib/i18n'

const TransactionsView = lazy(() => import('../views/Transactions'))
const BudgetsView = lazy(() => import('../views/Budgets'))
const ReportsView = lazy(() => import('../views/Reports'))

const VIEWS = { overview: OverviewView, transactions: TransactionsView, budgets: BudgetsView, reports: ReportsView }

function LiveIcon() {
  return (
    <span className="live-ic" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
        <path className="wave" d="M8.6 8.6a4.8 4.8 0 0 0 0 6.8m6.8-6.8a4.8 4.8 0 0 1 0 6.8" />
        <path className="wave two" d="M5.7 5.7a8.9 8.9 0 0 0 0 12.6m12.6-12.6a8.9 8.9 0 0 1 0 12.6" />
      </svg>
    </span>
  )
}

export default function Dashboard() {
  const { tab, setTab, period, setPeriod, live, setLive } = useApp()
  const tabs = useRef(null)
  const thumb = useRef(null)
  const idx = Math.max(
    0,
    TABS.findIndex((t) => t.id === tab),
  )
  const View = VIEWS[TABS[idx].id]

  useLayoutEffect(() => {
    const place = () => {
      const btn = tabs.current?.querySelector(`[data-tab="${TABS[idx].id}"]`)
      if (!btn || !thumb.current) return
      thumb.current.style.width = `${btn.offsetWidth}px`
      thumb.current.style.transform = `translateX(${btn.offsetLeft}px)`
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(tabs.current)
    return () => ro.disconnect()
  }, [idx])

  return (
    <div className={`dash ${idx === 0 ? 'first' : ''}`}>
      <Stage>
        <PageHead title={t('Financial Overview')} sub={t('Real-time financial insights to help you make informed decisions')}>
          <Dropdown
            icon="calendar"
            label={t('Reporting period')}
            value={period}
            onChange={setPeriod}
            options={PERIOD_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
          />
        </PageHead>

        <div className="tabs-row">
          <div className={`tabs ${idx === 0 ? 'first' : ''}`} ref={tabs} role="tablist" aria-label={t('Dashboard sections')}>
            <span className="tab-thumb" ref={thumb} />
            {TABS.map((tb, i) => (
              <button
                key={tb.id}
                type="button"
                role="tab"
                data-tab={tb.id}
                aria-selected={idx === i}
                className={`tab ${idx === i ? 'on' : ''}`}
                style={{ '--i': i }}
                onClick={() => setTab(tb.id)}
              >
                {t(tb.label)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`live rv ${live ? '' : 'off'}`}
            style={{ '--i': 4 }}
            onClick={() => setLive((l) => !l)}
            aria-pressed={live}
          >
            <LiveIcon />
            {live ? t('Live Update') : t('Paused')}
          </button>
        </div>
      </Stage>

      <Stage key={TABS[idx].id}>
        <Suspense fallback={null}>
          <View />
        </Suspense>
      </Stage>
    </div>
  )
}
