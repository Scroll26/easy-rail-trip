import { Fragment, useEffect, useRef } from 'react'
import { coverage, COVERAGE_LABEL } from '../data/interrailOperators'
import { legFocus, legSummary, sectionColor, timeOf, type RouteFocus } from '../lines'
import { formatMinutes } from '../rail/transitous'
import type { RouteLeg } from '../types'

const minutes = (a?: string, b?: string) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 60000) : null)

interface Props {
  legs: RouteLeg[]
  /** What's highlighted on the map */
  focused: string | null
  onFocus: (f: RouteFocus | null) => void
}

/** The trains (and ferries) of a train connection, one section each: tap a train or a station to see it on the map */
export default function RouteLegs({ legs, focused, onFocus }: Props) {
  const summary = legSummary(legs)
  const toggle = (f: RouteFocus) => onFocus(focused === f.key ? null : f)
  // A train picked on the map scrolls into view
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    listRef.current?.querySelector('.leg-card.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focused])

  const station = (key: string, name: string, at: [number, number] | undefined, time?: string, end = false) => (
    <button
      className={'leg-station' + (end ? ' end' : '') + (focused === key ? ' active' : '')}
      disabled={!at}
      onClick={() => at && toggle({ key, points: [{ at, name }] })}
    >
      <span className="leg-time">{timeOf(time)}</span>
      <span className="leg-dot" />
      <span className="ellipsis">{name}</span>
    </button>
  )

  return (
    <div className="route-legs-view">
      <p className={'coverage-summary ' + summary.tone}>
        {summary.icon} {summary.text}
      </p>
      <ol className="route-legs" ref={listRef}>
        {legs.map((l, i) => {
          const c = COVERAGE_LABEL[coverage(l.agency, l.mode)]
          const ride = minutes(l.departure, l.arrival)
          const prev = legs[i - 1]
          const wait = prev ? minutes(prev.arrival, l.departure) : null
          const key = `leg:${i}`
          const name = l.name || (l.mode === 'FERRY' ? 'Ferry' : 'Train')
          return (
            <Fragment key={i}>
              {prev && (
                <li className="leg-change muted small">
                  ⇄ Change{wait != null ? ` · ${formatMinutes(Math.max(0, wait))}` : ''}
                  {prev.to !== l.from ? ` · ${prev.to} → ${l.from}` : ''}
                </li>
              )}
              <li
                className={'leg-card' + (focused === key || focused?.startsWith(`st:${i}:`) ? ' active' : '')}
                style={{ '--leg-color': sectionColor(i) } as React.CSSProperties}
              >
                <button
                  className="leg-main"
                  disabled={!l.path?.length}
                  onClick={() => toggle(legFocus(l, i))}
                  title="Show this train on the map"
                >
                  <span className="leg-head">
                    <b>
                      {l.mode === 'FERRY' ? '⛴️' : '🚆'} {name}
                    </b>
                    <span className={'cov-badge ' + c.tone} title={c.text}>
                      {c.icon} {c.text}
                    </span>
                  </span>
                  <span className="small">
                    <b>{l.from}</b> → <b>{l.to}</b>
                  </span>
                  <span className="muted small">
                    {[ride != null ? formatMinutes(ride) : '', l.agency].filter(Boolean).join(' · ')}
                    {l.reservation ? ' · ⚠ seat reservation required' : ''}
                  </span>
                </button>
                <div className="leg-stations">
                  {station(`st:${i}:from`, l.from, l.fromAt, l.departure, true)}
                  {!!l.stops?.length && (
                    <details>
                      <summary className="small muted">{l.stops.length} stops in between</summary>
                      {l.stops.map((s, j) => (
                        <Fragment key={j}>{station(`st:${i}:${j}`, s, l.stopsAt?.[j])}</Fragment>
                      ))}
                    </details>
                  )}
                  {station(`st:${i}:to`, l.to, l.toAt, l.arrival, true)}
                </div>
              </li>
            </Fragment>
          )
        })}
      </ol>
      <p className="muted small">Times are from a typical weekday timetable, not live. Tap a train or a station to see it on the map.</p>
    </div>
  )
}
