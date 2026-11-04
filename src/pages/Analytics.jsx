import Icon from '../components/Icon'
import { Sparkline } from '../components/Charts'
import { CashFlowCard, EarningCard, HealthCard, HeatmapCard, SpendingCard, TxCard } from '../components/Cards'
import { Chg, CountUp, Dropdown, PageHead, Reveal, Stage } from '../components/ui'
import { useApp, useLead } from '../lib/store'
import { money } from '../lib/format'
import { CASHFLOW, PERIODS } from '../data/seed'
import { PERIOD_OPTIONS } from '../lib/routes'
import { t } from '../lib/i18n'

function SparkKpi({ icon, label, value, format = (n) => money(n), delta, note, values, color, d, i }) {
  const lead = useLead()
  return (
    <section className="card spark-kpi" style={{ '--d': `${d}ms` }}>
      <div className="kpi-head rv" style={{ '--i': 0 }}>
        <Icon name={icon} size={24} />
        <h2 className="card-h">{t(label)}</h2>
      </div>
      <strong className="kpi-val rv" style={{ '--i': 1 }}>
        <CountUp value={value} format={format} delay={lead + 120 + i * 90} />
      </strong>
      <Chg className="rv" style={{ '--i': 2 }} value={delta} note={t(note)} size="sm" />
      <Sparkline values={values} color={color} />
    </section>
  )
}

export default function Analytics() {
  const { period, setPeriod } = useApp()
  const p = PERIODS[period]
  const rate = CASHFLOW.income.map((v, i) => ((v - CASHFLOW.expenses[i]) / v) * 100)

  return (
    <Stage>
      <PageHead title={t('Analytics')} sub={t('Understand where your money comes from and where it goes')}>
        <Dropdown
          icon="calendar"
          label={t('Reporting period')}
          value={period}
          onChange={setPeriod}
          options={PERIOD_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
        />
      </PageHead>

      <div className="grid-4" style={{ marginTop: 0 }}>
        <SparkKpi
          icon="receive"
          label="Income"
          value={p.income}
          delta={p.incomeDelta}
          note={p.vs}
          values={CASHFLOW.income}
          color="var(--accent)"
          d={0}
          i={0}
        />
        <SparkKpi
          icon="calc"
          label="Expenses"
          value={p.expenses}
          delta={p.expensesDelta}
          note={p.vs}
          values={CASHFLOW.expenses}
          color="var(--solid)"
          d={70}
          i={1}
        />
        <SparkKpi
          icon="percent"
          label="Savings Rate"
          value={(p.net / p.income) * 100}
          format={(n) => `${n.toFixed(1)}%`}
          delta={3.4}
          note={p.vs}
          values={rate}
          color="var(--green)"
          d={140}
          i={2}
        />
        <SparkKpi
          icon="clock"
          label="Avg. Daily Spend"
          value={161.29}
          delta={-4.2}
          note={p.vs}
          values={[188, 172, 181, 165, 176, 158, 169, 161]}
          color="var(--blue)"
          d={210}
          i={3}
        />
        <CashFlowCard className="span-2" d={280} />
        <EarningCard className="span-2" d={340} />
      </div>
      <Reveal className="grid-4">
        <SpendingCard d={0} />
        <HealthCard d={90} />
        <TxCard
          className="span-2"
          d={180}
          title="Largest Movements"
          sub="Your biggest transactions this month"
          order={(a, b) => Math.abs(b.amount) - Math.abs(a.amount)}
        />
      </Reveal>
      <Reveal className="grid-4" after={650}>
        <HeatmapCard className="span-4" d={0} />
      </Reveal>
    </Stage>
  )
}
