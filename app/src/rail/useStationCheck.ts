import { useEffect, useState } from 'react'
import { findStation, type Station } from './transitous'

export type StationCheck =
  | { state: 'checking' }
  | { state: 'yes'; station: Station }
  | { state: 'no' }
  /** Couldn't check (offline): leave the button usable */
  | { state: 'unknown' }

/** Whether trains stop at / near a place, for enabling the "Direct trains" button */
export function useStationCheck(name: string, lat: number, lng: number, skip = false): StationCheck {
  const [check, setCheck] = useState<StationCheck>({ state: 'checking' })
  useEffect(() => {
    if (skip || !name) return
    let cancelled = false
    setCheck({ state: 'checking' })
    findStation(name, lat, lng)
      .then((s) => !cancelled && setCheck(s ? { state: 'yes', station: s } : { state: 'no' }))
      .catch(() => !cancelled && setCheck({ state: 'unknown' }))
    return () => {
      cancelled = true
    }
  }, [name, lat, lng, skip])
  return skip ? { state: 'unknown' } : check
}
