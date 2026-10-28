import { avoidedOnRoute, avoidOf, currentRoute, LINE_KINDS, lineTitle } from '../lines'
import { countryNames, useCountries } from '../countries'
import AvoidCountries from './AvoidCountries'
import RouteLegs from './RouteLegs'
import PriceField from './PriceField'
import GapNotice from './GapNotice'
import { formatDay, today } from '../dates'
import { deleteLine, saveLine } from '../store'
import type { LineEntry, Lookup, Trip } from '../trip'
import type { TravelLine } from '../types'

interface Props {
  line: TravelLine
  trip: Trip
  /** Its place in the trip, with the dates */
  entry: LineEntry | undefined
  lookup: Lookup
  /** The last route lookup didn't work (offline / service busy) */
  routeFailed: boolean
  onClose: () => void
  onFindTrains: () => void
}

/** A connection of the trip: a concrete train, or a general plan of where to go next */
export default function LineEditor({ line, trip, entry, lookup, routeFailed, onClose, onFindTrains }: Props) {
  const set = (patch: Partial<TravelLine>) => saveLine({ ...line, ...patch })
  const route = currentRoute(line, lookup)
  const title = lineTitle(line, lookup)
  const shapes = useCountries()
  const names = (isos: string[]) => countryNames(isos, shapes)
  const avoid = avoidOf(line, lookup)
  const through = route?.countries ?? []
  const stillIn = avoidedOnRoute(line, lookup)
  const atEnds = avoid.filter((iso) => iso === through[0] || iso === through[through.length - 1])
  const sameAsDefault = [...avoid].sort().join() === [...lookup.avoid].sort().join()
  return (
    <div className="editor">
      <div className="editor-head">
        <button className="ghost" onClick={onClose}>← Back</button>
        <span className="muted">Connection · saved automatically</span>
      </div>
      <h3 className="line-title">{title}</h3>
      {entry && (
        <>
          <div className="row two">
            <label className="field">
              <span>Leaves{line.fixedDate ? ' (fixed)' : ''}</span>
              <input type="date" value={entry.date} onChange={(e) => e.target.value && set({ fixedDate: e.target.value })} />
            </label>
            <div className="field">
              <span>Arrives</span>
              <span className="date-text">{formatDay(entry.arrive)}</span>
            </div>
          </div>
          {line.fixedDate ? (
            <p className="muted small">
              Fixed: the stops after it follow from this date.{' '}
              <button className="ghost link-btn inline" onClick={() => set({ fixedDate: null })}>
                Leave when the stop before ends instead
              </button>
            </p>
          ) : (
            <p className="muted small">Leaves when the stop before ends. Pick a date to fix it (e.g. a booked train).</p>
          )}
          <GapNotice trip={trip} id={entry.id} gap={entry.gap} lookup={lookup} />
        </>
      )}
      <label className="check">
        <input type="checkbox" checked={!!line.overnight} onChange={(e) => set({ overnight: e.target.checked })} />
        Night train: arrives the next day
      </label>
      <div className="field">
        <span>Type</span>
        <div className="segmented">
          {(Object.keys(LINE_KINDS) as TravelLine['kind'][]).map((k) => (
            <button
              key={k}
              className={line.kind === k ? 'active' : ''}
              style={{ '--seg': LINE_KINDS[k].color } as React.CSSProperties}
              onClick={() => set({ kind: k })}
            >
              {LINE_KINDS[k].icon} {LINE_KINDS[k].label}
            </button>
          ))}
        </div>
        <span className="muted small">{LINE_KINDS[line.kind].hint}</span>
      </div>
      {line.kind === 'train' && (
        <div className="route-info">
          {route?.path ? (
            <>
              <RouteLegs legs={route.legs} />
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
          ) : routeFailed ? (
            <span className="small muted">
              Couldn't look up the route right now (offline?). It's drawn straight and tried again next time.
            </span>
          ) : (
            <span className="small muted">Looking up the route along the tracks…</span>
          )}
        </div>
      )}
      <div className="field">
        <span>Avoid countries</span>
        <AvoidCountries value={avoid} onChange={(v) => set({ avoid: v })} />
        <span className="muted small">
          {line.avoid && !sameAsDefault ? (
            <>
              Just for this connection.{' '}
              <button className="ghost link-btn inline" onClick={() => set({ avoid: undefined })}>
                Use the default{lookup.avoid.length ? ` (${names(lookup.avoid)})` : ''}
              </button>
              .
            </>
          ) : (
            'The default from Settings. Change it here for just this connection.'
          )}{' '}
          Interrail covers your country of residence only on the way out and back home.
        </span>
      </div>
      <div className="row">
        <button onClick={onFindTrains}>🚆 {line.kind === 'train' ? 'Pick another train' : 'Find a direct train'}</button>
        <button onClick={() => set({ from: line.to, to: line.from })}>⇄ Swap direction</button>
      </div>
      <PriceField
        label="Ticket / reservation"
        price={line.price}
        paidExpenseId={line.paidExpenseId}
        onChange={set}
        payDate={entry?.date ?? today()}
        category="transport"
        note={title}
      />
      <label className="field">
        <span>Notes</span>
        <textarea
          rows={4}
          value={line.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder={line.kind === 'train' ? 'Platform, coach, seat…' : 'Ideas: by train or bus, stops in between…'}
        />
      </label>
      <div className="row">
        <button
          className="danger"
          onClick={() => {
            if (confirm(`Delete the connection "${title}"?`)) {
              deleteLine(line.id)
              onClose()
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
