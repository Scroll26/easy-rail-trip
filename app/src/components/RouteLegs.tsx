import { coverage, COVERAGE_LABEL } from '../data/interrailOperators'
import { legSummary, timeOf } from '../lines'
import type { RouteLeg } from '../types'

/** The trains (and ferries) of a train connection, with Interrail coverage and stops */
export default function RouteLegs({ legs }: { legs: RouteLeg[] }) {
  const summary = legSummary(legs)
  return (
    <div className="route-legs-view">
      <p className={'coverage-summary ' + summary.tone}>
        {summary.icon} {summary.text}
      </p>
      <ol className="route-legs">
        {legs.map((l, i) => {
          const c = COVERAGE_LABEL[coverage(l.agency, l.mode)]
          return (
            <li key={i}>
              <div className="leg-head">
                <b>
                  {l.mode === 'FERRY' ? '⛴️' : '🚆'} {l.name || (l.mode === 'FERRY' ? 'Ferry' : 'Train')}
                </b>
                <span className={'cov-badge ' + c.tone} title={c.text}>
                  {c.icon} {c.text}
                </span>
              </div>
              <div className="small">
                {timeOf(l.departure)} {l.from} → {timeOf(l.arrival)} {l.to}
              </div>
              <div className="muted small">
                {l.agency}
                {l.reservation ? ' · ⚠ seat reservation required' : ''}
              </div>
              {!!l.stops?.length && (
                <details className="small">
                  <summary>{l.stops.length} stops in between</summary>
                  <span className="muted">{l.stops.join(' · ')}</span>
                </details>
              )}
            </li>
          )
        })}
      </ol>
      <p className="muted small">Times are from a typical weekday timetable, not live.</p>
    </div>
  )
}
