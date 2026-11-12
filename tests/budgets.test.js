/* More budget categories, and custom ones flowing into the expense pickers. */
import { describe, expect, it } from 'vitest'
import { EXPENSE_CATEGORIES, expenseCategories, iconOfCategory, SPENDING_CATEGORIES } from '../src/lib/stats'

describe('spending categories', () => {
  it('offers far more than the starting six, each with an icon, Other last', () => {
    expect(SPENDING_CATEGORIES.length).toBeGreaterThanOrEqual(20)
    expect(SPENDING_CATEGORIES.every((c) => c.name && c.icon)).toBe(true)
    expect(EXPENSE_CATEGORIES.at(-1)).toBe('Other')
    expect(new Set(EXPENSE_CATEGORIES).size).toBe(EXPENSE_CATEGORIES.length)
  })
  it('adds custom budget names to the expense list, before Other, without repeats', () => {
    const cats = expenseCategories([{ name: 'Housing' }, { name: 'Coffee runs' }])
    expect(cats).toContain('Coffee runs')
    expect(cats.filter((c) => c === 'Housing')).toHaveLength(1)
    expect(cats.at(-1)).toBe('Other')
  })
  it('gives custom categories a generic icon', () => {
    expect(iconOfCategory('Pets')).toBe('heart')
    expect(iconOfCategory('Coffee runs')).toBe('category')
  })
})
