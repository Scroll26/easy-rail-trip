import { useEffect, useMemo, useRef, useState } from 'react'
import { categoryOf, EXPENSE_CATEGORIES, formatEur, formatMoney, summarize, toEur } from '../budget'
import { CURRENCY_STYLE } from '../data/currencies'
import { daysBetween, formatDay, today as todayDate } from '../dates'
import type { Rates } from '../rates'
import { deleteExpense, newId, saveExpense, updateSettings } from '../store'
import type { Expense, ExpenseCategory, Settings } from '../types'

const LAST_CURRENCY_KEY = 'rail-planner:last-currency'
const CURRENCIES = ['EUR', ...Object.keys(CURRENCY_STYLE).filter((c) => c !== 'EUR' && c !== 'GIP').sort()]

function lastCurrency() {
  try {
    return localStorage.getItem(LAST_CURRENCY_KEY) || 'EUR'
  } catch {
    return 'EUR'
  }
}

interface Props {
  expenses: Expense[]
  rates: Rates | null
  settings: Settings
  /** First day of the timeline, the default budget start */
  firstDay: string | null
}

export default function BudgetView({ expenses, rates, settings, firstDay }: Props) {
  const today = todayDate()
  const start = settings.budgetStart ?? firstDay ?? expenses[expenses.length - 1]?.date ?? today
  const s = useMemo(
    () => summarize(expenses, rates, settings.budgetDaily, start, today),
    [expenses, rates, settings.budgetDaily, start, today],
  )
  const [editing, setEditing] = useState<Expense | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [openDay, setOpenDay] = useState<string | null>(null)

  const byDay = useMemo(() => {
    const m = new Map<string, Expense[]>()
    for (const e of expenses) if (!e.oneOff) m.set(e.date, [...(m.get(e.date) ?? []), e])
    return m
  }, [expenses])
  const oneOffs = expenses.filter((e) => e.oneOff)
  const beforeTrip = s.daysElapsed === 0
  const under = s.balance >= 0
  const scale = Math.max(s.goal * 1.5, ...s.days.map((d) => d.spent))
  const daysNewestFirst = [...s.days].reverse()

  return (
    <div className="budget">
      {/* Headline */}
      {beforeTrip ? (
        <section className="budget-hero">
          <span className="muted small">Your daily budget starts</span>
          <strong className="hero-number">{formatDay(start)}</strong>
          <span className="muted small">
            in {daysBetween(today, start)} days · goal {formatEur(s.goal)} per day
          </span>
          <button
            type="button"
            className="icon-btn hero-gear"
            title="Budget settings"
            aria-expanded={showSettings}
            onClick={() => setShowSettings(!showSettings)}
          >
            ⚙️
          </button>
          {showSettings && (
            <div className="hero-settings">
              <div className="row two">
                <label className="field">
                  <span>Daily goal (€)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={settings.budgetDaily}
                    onChange={(e) => updateSettings({ budgetDaily: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </label>
                <label className="field">
                  <span>Budget starts</span>
                  <input
                    type="date"
                    value={settings.budgetStart ?? ''}
                    onChange={(e) => updateSettings({ budgetStart: e.target.value || null })}
                  />
                </label>
              </div>
              <p className="muted small">
                {settings.budgetStart
                  ? 'Clear the date to start with your first timeline day again.'
                  : `No date set, so it starts with ${firstDay ? 'your first timeline day' : 'your first expense'} (${formatDay(start)}).`}
              </p>
            </div>
          )}
        </section>
      ) : (
        <section className={'budget-hero ' + (under ? 'good' : 'bad')}>
          <span className="status-line">
            {under ? '✓ Under budget' : '⚠ Over budget'}
          </span>
          <strong className="hero-number">{formatEur(Math.abs(s.balance))}</strong>
          <span className="muted small">
            {under ? 'left over' : 'more than planned'} after {s.daysElapsed} {s.daysElapsed === 1 ? 'day' : 'days'} at{' '}
            {formatEur(s.goal)}/day
          </span>
          <div className="stat-row">
            <div>
              <span className="muted small">Spent (daily)</span>
              <b>{formatEur(s.spent)}</b>
            </div>
            <div>
              <span className="muted small">Average</span>
              <b>{formatEur(s.average)}/day</b>
            </div>
            <div>
              <span className="muted small">Total incl. one-offs</span>
              <b>{formatEur(s.spent + s.oneOffTotal)}</b>
            </div>
            <div>
              <span className="muted small">Today</span>
              <b>
                {formatEur(s.spentToday)} <span className="muted">of {formatEur(s.goal)}</span>
              </b>
            </div>
          </div>
          <div
            className="meter"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={s.goal}
            aria-valuenow={s.spentToday}
            aria-label="Spent today"
          >
            <span
              className={s.spentToday > s.goal ? 'over' : ''}
              style={{ width: `${Math.min(100, (s.spentToday / s.goal) * 100)}%` }}
            />
          </div>
          <button
            type="button"
            className="icon-btn hero-gear"
            title="Budget settings"
            aria-expanded={showSettings}
            onClick={() => setShowSettings(!showSettings)}
          >
            ⚙️
          </button>
          {showSettings && (
            <div className="hero-settings">
              <div className="row two">
                <label className="field">
                  <span>Daily goal (€)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={settings.budgetDaily}
                    onChange={(e) => updateSettings({ budgetDaily: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </label>
                <label className="field">
                  <span>Budget starts</span>
                  <input
                    type="date"
                    value={settings.budgetStart ?? ''}
                    onChange={(e) => updateSettings({ budgetStart: e.target.value || null })}
                  />
                </label>
              </div>
              <p className="muted small">
                {settings.budgetStart
                  ? 'Clear the date to start with your first timeline day again.'
                  : `No date set, so it starts with ${firstDay ? 'your first timeline day' : 'your first expense'} (${formatDay(start)}).`}
              </p>
            </div>
          )}
        </section>
      )}
      {s.unconverted > 0 && (
        <p className="muted small">
          {s.unconverted} expense{s.unconverted > 1 ? 's' : ''} not counted yet: the exchange rate loads next time you're
          online.
        </p>
      )}

      <ExpenseForm key={editing?.id ?? 'new'} editing={editing} rates={rates} onDone={() => setEditing(null)} />

      {/* Per day */}
      {s.days.length > 0 && (
        <section>
          <h3>Per day</h3>
          <ul className="day-bars">
            {daysNewestFirst.map((d) => {
              const over = d.spent > s.goal
              const list = byDay.get(d.date) ?? []
              const open = openDay === d.date
              return (
                <li key={d.date} className={d.date > today ? 'future' : ''}>
                  <button
                    className="day-bar"
                    onClick={() => setOpenDay(open ? null : d.date)}
                    title={`${formatDay(d.date)}: ${formatEur(d.spent)} of ${formatEur(s.goal)}`}
                    disabled={list.length === 0}
                  >
                    <span className="day-label">{d.date === today ? 'Today' : formatDay(d.date)}</span>
                    <span className="bar-track">
                      <span className={'bar-fill' + (over ? ' over' : '')} style={{ width: `${(d.spent / scale) * 100}%` }} />
                      <span className="goal-tick" style={{ left: `${(s.goal / scale) * 100}%` }} />
                    </span>
                    <span className="day-amount">
                      {over && <span aria-label="over the daily goal">⚠ </span>}
                      {formatEur(d.spent, 0)}
                    </span>
                  </button>
                  {open && (
                    <ul className="list expense-list">
                      {list.map((e) => (
                        <ExpenseRow key={e.id} e={e} rates={rates} onEdit={() => setEditing(e)} />
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="muted small">Tap a day to see its expenses. The thin line marks your daily goal.</p>
        </section>
      )}

      {/* One-off costs */}
      <section>
        <h3>One-off costs · {formatEur(s.oneOffTotal)}</h3>
        <p className="muted small">The pass, prepaid hostels and other big costs. They don't count against your daily goal.</p>
        {oneOffs.length > 0 && (
          <ul className="list expense-list">
            {oneOffs.map((e) => (
              <ExpenseRow key={e.id} e={e} rates={rates} onEdit={() => setEditing(e)} showDate />
            ))}
          </ul>
        )}
      </section>

    </div>
  )
}

function ExpenseRow({ e, rates, onEdit, showDate }: { e: Expense; rates: Rates | null; onEdit: () => void; showDate?: boolean }) {
  const eur = toEur(e, rates)
  const cat = categoryOf(e)
  return (
    <li>
      <button className="item" onClick={onEdit}>
        <span className="item-icon plain">{cat.icon}</span>
        <span className="item-main">
          <strong className="ellipsis">{e.note || cat.label}</strong>
          <span className="muted small">
            {showDate ? formatDay(e.date) + ' · ' : ''}
            {[e.currency === 'EUR' ? '' : formatMoney(e.amount, e.currency), e.category ? cat.label : '']
              .filter(Boolean)
              .join(' · ') || (e.note ? '' : formatDay(e.date))}
          </span>
        </span>
        <b className="expense-eur">{eur == null ? '? €' : formatEur(eur)}</b>
      </button>
      <button className="icon-btn danger" title="Delete" onClick={() => confirm('Delete this expense?') && deleteExpense(e.id)}>
        🗑️
      </button>
    </li>
  )
}

function ExpenseForm({ editing, rates, onDone }: { editing: Expense | null; rates: Rates | null; onDone: () => void }) {
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [currency, setCurrency] = useState(editing?.currency ?? lastCurrency())
  const [category, setCategory] = useState<ExpenseCategory | null>(editing?.category ?? null)
  const [note, setNote] = useState(editing?.note ?? '')
  const [date, setDate] = useState(editing?.date ?? todayDate())
  const [oneOff, setOneOff] = useState(editing?.oneOff ?? false)

  const formRef = useRef<HTMLFormElement>(null)
  // Editing starts from a row further down: bring the form into view
  useEffect(() => {
    if (editing) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [editing])

  const value = parseFloat(amount.replace(',', '.'))
  const rate = currency === 'EUR' ? 1 : (rates?.rates[currency] ?? null)
  const preview = value > 0 && currency !== 'EUR' ? (rate ? `≈ ${formatEur(value / rate)}` : 'rate loads when online') : ''

  function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!(value > 0)) return
    const now = Date.now()
    saveExpense({
      id: editing?.id ?? newId(),
      date,
      amount: Math.round(value * 100) / 100,
      currency,
      // Keep the rate from the day of the expense; a changed currency gets today's
      rate: currency === 'EUR' ? 1 : editing && editing.currency === currency ? editing.rate : rate,
      category,
      note: note.trim(),
      oneOff,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    })
    try {
      localStorage.setItem(LAST_CURRENCY_KEY, currency)
    } catch {
      /* storage unavailable */
    }
    setAmount('')
    setNote('')
    setCategory(null)
    setOneOff(false)
    onDone()
  }

  return (
    <form ref={formRef} className="expense-form" onSubmit={submit}>
      <h3>{editing ? 'Edit expense' : 'Add expense'}</h3>
      <div className="amount-row">
        <input
          className="amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          aria-label="Amount"
          autoFocus={!!editing}
        />
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c} {CURRENCY_STYLE[c]?.symbol && CURRENCY_STYLE[c].symbol !== c ? `(${CURRENCY_STYLE[c].symbol})` : ''}
            </option>
          ))}
        </select>
        <button className="primary" type="submit" disabled={!(value > 0)}>
          {editing ? 'Save' : 'Add'}
        </button>
      </div>
      {preview && <span className="muted small">{preview}</span>}
      <div className="chips cat-chips">
        {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((c) => (
          <button
            key={c}
            type="button"
            className={'chip' + (category === c ? ' active' : '')}
            // Tap again to remove the tag
            onClick={() => setCategory(category === c ? null : c)}
            title={EXPENSE_CATEGORIES[c].label}
          >
            {EXPENSE_CATEGORIES[c].icon} {EXPENSE_CATEGORIES[c].label}
          </button>
        ))}
      </div>
      <div className="row two">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
      </div>
      <label className="check small">
        <input type="checkbox" checked={oneOff} onChange={(e) => setOneOff(e.target.checked)} />
        One-off cost (not part of the daily budget)
      </label>
      {editing && (
        <button type="button" className="ghost small" onClick={onDone}>
          Cancel editing
        </button>
      )}
    </form>
  )
}
