import { avoidedOnRoute, avoidOf, currentRoute, type RouteFocus } from '../lines'
import { countryNames, useCountries } from '../countries'
import RouteLegs from './RouteLegs'
import type { Lookup } from '../trip'
import type { TravelLine } from '../types'

interface Props {
  line: TravelLine
  lookup: Lookup
  /** The last route lookup didn't work (offline / service busy) */
  routeFailed: boolean
  /** Shared trip: routes aren't looked up, so a missing one just stays straight */
  readOnly?: boolean
  routeFocus: RouteFocus | null
  onRouteFocus: (f: RouteFocus | null) => void
}

/** A train connection's trains, the countries it runs through, and what it stays out of */
export default function RouteInfo({ line, lookup, routeFailed, readOnly, routeFocus, onRouteFocus }: Props) {
  const route = currentRoute(line, lookup)
  const shapes = useCountries()
  const names = (isos: string[]) => countryNames(isos, shapes)
  const avoid = avoidOf(line, lookup)
  const through = route?.countries ?? []
  const stillIn = avoidedOnRoute(line, lookup)
  const atEnds = avoid.filter((iso) => iso === through[0] || iso === through[through.length - 1])
  return (
    <div className="route-info">
      {route?.path ? (
        <>
          <RouteLegs legs={route.legs} focused={routeFocus?.key ?? null} onFocus={onRouteFocus} />
          {through.length > 1 && <span className="small muted">Through {through.map((iso) => names([iso])).join(' → ')}</span>}
          {stillIn.length > 0 ? (
            <span className="small warn-text">⚠ Runs through {names(stillIn)}: no train route around it was found.</span>
          ) : (
            avoid.length > atEnds.length && <span className="small cov-text good">✓ Stays out of {names(avoid.filter((c) => !atEnds.includes(c)))}</span>
          )}
          {atEnds.length > 0 && (
            <span className="small muted">
              {through[0] === atEnds[0] ? 'Starts' : 'Ends'} in {names(atEnds)}, so that part can't be avoided.
            </span>
          )}
        </>
      ) : route ? (
        <span className="small muted">No train route found between these places, so it's drawn as a straight line.</span>
      ) : readOnly ? (
        <span className="small muted">The trains aren't known yet, so it's drawn as a straight line.</span>
      ) : routeFailed ? (
        <span className="small muted">
          Couldn't look up the route right now (offline?). It's drawn straight and tried again next time.
        </span>
      ) : (
        <span className="small muted">Looking up the route along the tracks…</span>
      )}
    </div>
  )
}
