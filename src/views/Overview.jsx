import {
  BalanceCard,
  BillsCard,
  CashFlowCard,
  EarningCard,
  HealthCard,
  HeatmapCard,
  KpiCard,
  MarketsCard,
  NetProfitCard,
  PortfolioCard,
  RatesCard,
  QuickTransferCard,
  ReportCard,
  SavingsCard,
  SpendingCard,
  TxCard,
} from '../components/Cards'
import { Reveal } from '../components/ui'
import { useApp } from '../lib/store'
import { t } from '../lib/i18n'

export default function OverviewView() {
  const { period, stats } = useApp()
  const p = stats.periods[period]

  return (
    <>
      {/* ---------------- the reference screen ---------------- */}
      <div className="ov-top">
        <div className="ov-left">
          <BalanceCard attached d={0} />
          <EarningCard d={180} />
        </div>
        <div className="ov-right">
          <KpiCard icon="receive" label="Income" value={p.income} delta={p.incomeDelta} note={p.vs} d={70} />
          <KpiCard
            icon="calc"
            label="Total Expenses"
            value={p.expenses}
            delta={p.expensesDelta}
            note={p.vs.replace('vs', 'from').toLowerCase()}
            d={140}
            i={1}
          />
          <NetProfitCard d={210} />
          <ReportCard d={280} />
          <SavingsCard d={350} />
        </div>
      </div>

      {/* ---------------- extra insights ---------------- */}
      <Reveal>
        <h3 className="section-label">{t('Insights & activity')}</h3>
        <div className="grid-4">
          <CashFlowCard className="span-2" d={0} />
          <SpendingCard d={90} />
          <QuickTransferCard d={180} />
        </div>
      </Reveal>
      <Reveal className="grid-4" after={650}>
        <TxCard className="span-2" d={0} />
        <BillsCard d={90} />
        <HealthCard d={180} />
      </Reveal>
      <Reveal className="grid-4" after={850}>
        <HeatmapCard className="span-4" d={0} />
      </Reveal>

      {/* ---------------- live markets ---------------- */}
      <Reveal>
        <h3 className="section-label">{t('Markets')}</h3>
        <div className="grid-4">
          <PortfolioCard className="span-2" d={0} />
          <MarketsCard className="span-2" d={90} />
        </div>
      </Reveal>
      <Reveal className="grid-4" after={300}>
        <RatesCard className="span-4" d={0} />
      </Reveal>
    </>
  )
}
