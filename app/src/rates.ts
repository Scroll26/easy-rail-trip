import { useEffect, useState } from 'react'

// Euro exchange rates from free, key-less sources, cached on the device so they
// keep working offline. Refreshed at most every 6 hours.
const CACHE_KEY = 'rail-planner:rates'
const MAX_AGE = 6 * 60 * 60 * 1000

export interface Rates {
  /** 1 EUR = rates[code] units of that currency */
  rates: Record<string, number>
  /** When the provider last updated the rates */
  updated: number
  /** When we fetched them */
  fetched: number
}

function readCache(): Rates | null {
  try {
    const r = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '')
    return r?.rates ? r : null
  } catch {
    return null
  }
}

function writeCache(r: Rates) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(r))
  } catch {
    /* storage unavailable */
  }
}

async function fetchRates(): Promise<Rates> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/EUR')
    const j = await res.json()
    if (j.result !== 'success') throw new Error('rates unavailable')
    return { rates: j.rates, updated: j.time_last_update_unix * 1000, fetched: Date.now() }
  } catch {
    // Fallback provider
    const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json')
    const j = await res.json()
    const rates = Object.fromEntries(Object.entries(j.eur as Record<string, number>).map(([k, v]) => [k.toUpperCase(), v]))
    return { rates, updated: Date.parse(j.date), fetched: Date.now() }
  }
}

let pending: Promise<Rates | null> | null = null

/** Cached rates, refreshed in the background when old. Returns null until anything is known. */
export function useRates(enabled = true) {
  const [rates, setRates] = useState<Rates | null>(readCache)
  useEffect(() => {
    if (!enabled) return
    const cached = readCache()
    if (cached && Date.now() - cached.fetched < MAX_AGE) return
    pending ??= fetchRates()
      .then((r) => {
        writeCache(r)
        return r
      })
      .catch(() => null)
      .finally(() => {
        pending = null
      })
    pending.then((r) => r && setRates(r))
  }, [enabled])
  return rates
}

/** "24.36", "367", "1.956" — a sensible number of digits for any size of rate */
export function formatRate(n: number) {
  if (n >= 100) return Math.round(n).toLocaleString('en-GB')
  if (n >= 10) return n.toFixed(1)
  if (n >= 1) return n.toFixed(2)
  return n.toFixed(3)
}
