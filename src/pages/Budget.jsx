import Icon from '../components/Icon'
import { PageHead, Stage } from '../components/ui'
import { useApp } from '../lib/store'
import BudgetsView from '../views/Budgets'
import { t } from '../lib/i18n'

export default function Budget() {
  const { budgets, setBudgets, toast } = useApp()

  // give every category 10% headroom over what it actually spent, rounded to $50
  const rebalance = () => {
    setBudgets((list) => list.map((b) => ({ ...b, limit: Math.max(100, Math.ceil((b.spent * 1.1) / 50) * 50) })))
    toast(t('Budgets rebalanced'), t('Each category now has 10% headroom over this month’s spend.'), { icon: 'sparkle' })
  }

  return (
    <Stage>
      <PageHead title={t('Budget')} sub={t('Plan your month and keep every category on track')}>
        <button type="button" className="btn solid lg" onClick={rebalance} disabled={!budgets.length}>
          <Icon name="sparkle" size={18} />
          {t('Smart rebalance')}
        </button>
      </PageHead>
      <BudgetsView attached={false} />
    </Stage>
  )
}
