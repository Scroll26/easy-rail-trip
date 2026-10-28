import { addDays, daysBetween } from './dates'
import type { Rates } from './rates'
import { newId, saveExpense } from './store'
import type { Expense, ExpenseCategory } from './types'

/** Shown for expenses without a category */
export const NO_CATEGORY = { label: 'Expense', icon: '💶' }

export const categoryOf = (e: { category: ExpenseCategory | null }) =>
  (e.category && EXPENSE_CATEGORIES[e.category]) || NO_CATEGORY

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, { label: string; icon: string }> = {
  food: { label: 'Food & drink', icon: '🍽️' },
  groceries: { label: 'Groceries', icon: '🛒' },
  stay: { label: 'Accommodation', icon: '🛏️' },
  transport: { label: 'Transport', icon: '🚆' },
  sights: { label: 'Sights & tickets', icon: '🎟️' },
  nightlife: { label: 'Nightlife', icon: '🍻' },
  shopping: { label: 'Shopping', icon: '🛍️' },
  other: { label: 'Other', icon: '📦' },
}

/** Amount in EUR: the rate saved with the expense, else today's rate, else unknown */
export function toEur(e: Expense, rates: Rates | null): number | null {
  if (e.currency === 'EUR') return e.amount
  const rate = e.rate ?? rates?.rates[e.currency]
  return rate ? e.amount / rate : null
}

export const formatEur = (n: number, decimals = n % 1 === 0 || Math.abs(n) >= 100 ? 0 : 2) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(n)

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

export interface DaySpend {
  date: string
  spent: number
}

export interface BudgetSummary {
  start: string
  today: string
  /** Days since the start, including today; 0 before the trip */
  daysElapsed: number
  goal: number
  /** Daily expenses up to today, in EUR */
  spent: number
  allowance: number
  /** Positive = under budget */
  balance: number
  average: number
  spentToday: number
  oneOffTotal: number
  /** Every day from the start until today (or the last expense), oldest first */
  days: DaySpend[]
  /** Expenses that couldn't be converted yet (no exchange rate offline) */
  unconverted: number
}

export function summarize(
  expenses: Expense[],
  rates: Rates | null,
  goal: number,
  start: string,
  today: string,
): BudgetSummary {
  const perDay = new Map<string, number>()
  let oneOffTotal = 0
  let unconverted = 0
  for (const e of expenses) {
    const eur = toEur(e, rates)
    if (eur == null) {
      unconverted++
      continue
    }
    if (e.oneOff) oneOffTotal += eur
    else perDay.set(e.date, (perDay.get(e.date) ?? 0) + eur)
  }

  const daysElapsed = today < start ? 0 : daysBetween(start, today) + 1
  let spent = 0
  for (const [date, v] of perDay) if (date >= start && date <= today) spent += v
  const allowance = daysElapsed * goal

  // Day rows: start → today, plus later days that already have expenses
  const lastExpense = [...perDay.keys()].sort().pop()
  const end = lastExpense && lastExpense > today ? lastExpense : today
  const days: DaySpend[] = []
  if (end >= start && daysBetween(start, end) < 400)
    for (let d = start; d <= end; d = addDays(d, 1)) days.push({ date: d, spent: perDay.get(d) ?? 0 })

  return {
    start,
    today,
    daysElapsed,
    goal,
    spent,
    allowance,
    balance: allowance - spent,
    average: daysElapsed ? spent / daysElapsed : 0,
    spentToday: perDay.get(today) ?? 0,
    oneOffTotal,
    days,
    unconverted,
  }
}

/** Records a planned cost (bed, ticket) as paid: a one-off expense in EUR. Returns its id. */
export function recordPaid(amount: number, date: string, category: ExpenseCategory, note: string) {
  const now = Date.now()
  const id = newId()
  saveExpense({ id, date, amount, currency: 'EUR', rate: 1, category, note, oneOff: true, createdAt: now, updatedAt: now })
  return id
}
