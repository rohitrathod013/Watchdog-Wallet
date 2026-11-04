import Icon from '../components/Icon'
import { QuickTransferCard, TxCard } from '../components/Cards'
import { CountUp, PageHead, Stage } from '../components/ui'
import { useApp, useLead } from '../lib/store'
import { whole } from '../lib/format'

function LimitsCard({ d }) {
  const { sentToday } = useApp()
  const lead = useLead()
  const limits = [
    { name: 'Daily transfers', used: 250 + sentToday, cap: 5000 },
    { name: 'Monthly transfers', used: 3240 + sentToday, cap: 50000 },
    { name: 'International', used: 642, cap: 10000 },
  ]
  return (
    <section className="card health-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">Transfer Limits</h2>
          <p className="card-sub">Resets at midnight and on the 1st</p>
        </div>
        <span className="ic-ring">
          <Icon name="shield" size={19} />
        </span>
      </div>
      <div className="meters" style={{ marginTop: 22 }}>
        {limits.map((l, r) => {
          const p = l.used / l.cap
          return (
            <div key={l.name} className="rv" style={{ '--i': 1 + r * 0.6 }}>
              <div className="meter-top">
                <span>{l.name}</span>
                <b>
                  <CountUp value={l.used} format={(n) => whole(n)} delay={lead + 300 + r * 90} /> <em>/ {whole(l.cap)}</em>
                </b>
              </div>
              <div className="meter hatch" style={{ height: 12 }}>
                <i className={p > 0.9 ? 'over' : ''} style={{ '--p': `${Math.max(2, Math.min(100, p * 100))}%`, '--r': r }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function Transfer() {
  const { openModal } = useApp()
  return (
    <Stage>
      <PageHead title="Transfer" sub="Move money between people and accounts in seconds">
        <button type="button" className="btn solid lg" onClick={() => openModal('request')}>
          <Icon name="request" size={19} />
          Request money
        </button>
      </PageHead>
      <div className="grid-2" style={{ marginTop: 0 }}>
        <QuickTransferCard big d={0} />
        <div className="stack">
          <TxCard d={90} title="Recent Transfers" sub="People you paid or asked to pay" filter={(t) => t.category === 'Transfer'} limit={5} />
          <LimitsCard d={180} />
        </div>
      </div>
    </Stage>
  )
}
