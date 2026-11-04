import Icon from '../components/Icon'
import { PageHead, Stage } from '../components/ui'
import { useApp } from '../lib/store'
import BudgetsView from '../views/Budgets'

export default function Budget() {
  const { budgets, setBudgets, toast } = useApp()

  // give every category 10% headroom over what it actually spent, rounded to $50
  const rebalance = () => {
    setBudgets((list) => list.map((b) => ({ ...b, limit: Math.max(100, Math.ceil((b.spent * 1.1) / 50) * 50) })))
    toast('Budgets rebalanced', 'Each category now has 10% headroom over this month’s spend.', { icon: 'sparkle' })
  }

  return (
    <Stage>
      <PageHead title="Budget" sub="Plan your month and keep every category on track">
        <button type="button" className="btn solid lg" onClick={rebalance} disabled={!budgets.length}>
          <Icon name="sparkle" size={18} />
          Smart rebalance
        </button>
      </PageHead>
      <BudgetsView attached={false} />
    </Stage>
  )
}
