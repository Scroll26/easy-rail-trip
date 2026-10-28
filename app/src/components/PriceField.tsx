import { formatEur, recordPaid } from '../budget'
import { deleteExpense, useExpenses } from '../store'
import type { ExpenseCategory } from '../types'

interface Props {
  label: string
  price: number | null | undefined
  paidExpenseId: string | null | undefined
  onChange: (patch: { price?: number | null; paidExpenseId?: string | null }) => void
  /** Date, category and note of the expense created when it's paid */
  payDate: string
  category: ExpenseCategory
  note: string
}

/** A planned price (counted in the budget forecast) that turns into an expense once paid */
export default function PriceField({ label, price, paidExpenseId, onChange, payDate, category, note }: Props) {
  const expenses = useExpenses()
  const paid = paidExpenseId ? expenses.find((e) => e.id === paidExpenseId) : undefined

  if (paid)
    return (
      <div className="field">
        <span>{label}</span>
        <div className="row price-paid">
          <span className="small">✓ Paid {formatEur(paid.amount)} · in your budget as a one-off cost</span>
          <button
            className="ghost small"
            onClick={() => {
              deleteExpense(paid.id)
              onChange({ paidExpenseId: null })
            }}
          >
            Undo
          </button>
        </div>
      </div>
    )

  return (
    <div className="field">
      <span>{label}</span>
      <div className="row two">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={price ?? ''}
          onChange={(e) => onChange({ price: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
          placeholder="Price in €, optional"
        />
        <button disabled={!price} onClick={() => price && onChange({ paidExpenseId: recordPaid(price, payDate, category, note) })}>
          ✓ Paid
        </button>
      </div>
      <span className="muted small">Planned prices show up in the budget forecast until you mark them paid.</span>
    </div>
  )
}
