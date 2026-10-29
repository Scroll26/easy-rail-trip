import { avoidOf, LINE_KINDS, lineTitle, type RouteFocus } from '../lines'
import { countryNames, useCountries } from '../countries'
import AvoidCountries from './AvoidCountries'
import EndpointField from './EndpointField'
import RouteInfo from './RouteInfo'
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
  /** The train or station highlighted on the map */
  routeFocus: RouteFocus | null
  onRouteFocus: (f: RouteFocus | null) => void
  /** Tap the new start / end on the map */
  onPickEnd: (end: 'from' | 'to') => void
}

/** A connection of the trip: a concrete train, or a general plan of where to go next */
export default function LineEditor({ line, trip, entry, lookup, routeFailed, onClose, onFindTrains, routeFocus, onRouteFocus, onPickEnd }: Props) {
  const set = (patch: Partial<TravelLine>) => saveLine({ ...line, ...patch })
  const title = lineTitle(line, lookup)
  const shapes = useCountries()
  const names = (isos: string[]) => countryNames(isos, shapes)
  const avoid = avoidOf(line, lookup)
  // The stops this connection sits between, offered first as its ends
  const at = trip.entries.findIndex((e) => e.id === line.id)
  const near = [trip.entries[at - 1], trip.entries[at + 1]].flatMap((e) => (e?.kind === 'stop' ? [e.stop.placeId] : []))
  const sameAsDefault = [...avoid].sort().join() === [...lookup.avoid].sort().join()
  return (
    <div className="editor">
      <div className="editor-head">
        <button className="ghost" onClick={onClose}>← Back</button>
        <span className="muted">Connection · saved automatically</span>
      </div>
      <h3 className="line-title">{title}</h3>
      <div className="endpoints">
        <EndpointField label="From" value={line.from} lookup={lookup} suggested={near} onChange={(from) => set({ from })} onPickOnMap={() => onPickEnd('from')} />
        <EndpointField label="To" value={line.to} lookup={lookup} suggested={near} onChange={(to) => set({ to })} onPickOnMap={() => onPickEnd('to')} />
      </div>
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
        <RouteInfo line={line} lookup={lookup} routeFailed={routeFailed} routeFocus={routeFocus} onRouteFocus={onRouteFocus} />
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
