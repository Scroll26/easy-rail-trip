import { currentRoute, legSummary, LINE_KINDS, lineTitle } from '../lines'
import RouteLegs from './RouteLegs'
import { deleteLine, listOrder, saveLine } from '../store'
import { between, type Lookup } from '../timeline'
import type { TravelLine } from '../types'
import SortableRows from './SortableRows'

interface Props {
  lines: TravelLine[]
  lookup: Lookup
  highlightId: string | null
  onAdd: () => void
  onShow: (line: TravelLine) => void
  onEdit: (id: string) => void
}

export default function LinesView({ lines, lookup, highlightId, onAdd, onShow, onEdit }: Props) {
  return (
    <>
      <div className="row list-head">
        <div className="line-legend">
          {Object.values(LINE_KINDS).map((k) => (
            <span key={k.label} className="small">
              <span className={'line-swatch ' + (k.icon === '🚆' ? 'train' : 'plan')} /> {k.label}
            </span>
          ))}
        </div>
        <button className="primary" onClick={onAdd}>+ Line</button>
      </div>

      {lines.length === 0 && (
        <p className="empty muted">
          Draw where you'll travel: tap <b>+ Line</b>, then the start and the destination on the map. That can be one of
          your pins, a station dot, a town, or any point.
        </p>
      )}

      <SortableRows
        items={lines}
        rowClass={(l) => (highlightId === l.id ? 'highlighted' : '')}
        onMove={(item, prev, next) => saveLine({ ...item, order: between(prev && listOrder(prev), next && listOrder(next)) })}
        renderRow={(l, handle) => (
          <>
            <button ref={handle.ref} className="drag-handle" aria-label="Drag to reorder" {...handle.attributes} {...handle.listeners}>
              ⠿
            </button>
            <button className="item" onClick={() => onShow(l)}>
              <span className="item-icon plain" style={{ boxShadow: `inset 0 -3px 0 ${LINE_KINDS[l.kind].color}` }}>
                {LINE_KINDS[l.kind].icon}
              </span>
              <span className="item-main">
                <strong className="ellipsis">{lineTitle(l, lookup)}</strong>
                <span className="muted small ellipsis">
                  {LINE_KINDS[l.kind].label}
                  {(() => {
                    const r = currentRoute(l, lookup)
                    return r?.legs.length ? ` · ${legSummary(r.legs).icon} Interrail` : ''
                  })()}
                  {l.notes ? ' · ' + l.notes : ''}
                </span>
              </span>
            </button>
            <button className="icon-btn" title="Edit" onClick={() => onEdit(l.id)}>✏️</button>
            <button
              className="icon-btn danger"
              title="Delete"
              onClick={() => confirm(`Delete the line "${lineTitle(l, lookup)}"?`) && deleteLine(l.id)}
            >
              🗑️
            </button>
          </>
        )}
      />
    </>
  )
}

export function LineEditor({
  line,
  lookup,
  routeFailed,
  onClose,
}: {
  line: TravelLine
  lookup: Lookup
  /** The last route lookup didn't work (offline / service busy) */
  routeFailed: boolean
  onClose: () => void
}) {
  const set = (patch: Partial<TravelLine>) => saveLine({ ...line, ...patch })
  const route = currentRoute(line, lookup)
  return (
    <div className="editor">
      <div className="editor-head">
        <button className="ghost" onClick={onClose}>← Back</button>
        <span className="muted">Travel line · saved automatically</span>
      </div>
      <h3 className="line-title">{lineTitle(line, lookup)}</h3>
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
            <RouteLegs legs={route.legs} />
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
      <div className="row">
        <button onClick={() => set({ from: line.to, to: line.from })}>⇄ Swap direction</button>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea
          rows={4}
          value={line.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder={line.kind === 'train' ? 'Train number, times, reservation…' : 'Ideas: by train or bus, stops in between…'}
        />
      </label>
      <div className="row">
        <button
          className="danger"
          onClick={() => {
            if (confirm(`Delete the line "${lineTitle(line, lookup)}"?`)) {
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
