import { useState } from 'react'
import { formatDay, today } from '../dates'
import { search } from '../geocode'
import { deleteItem, getItem, nextOrder, saveItem } from '../store'
import { describeItem, orderForTime, type Lookup } from '../timeline'
import type { TimelineItem, TrainInfo } from '../types'

interface Props {
  item: TimelineItem
  items: TimelineItem[]
  lookup: Lookup
  onClose: () => void
  onOpenPlace: (id: string) => void
}

const TYPE_LABEL = { place: 'Place', train: 'Train', stay: 'Accommodation', note: 'Note' }

export default function ItemEditor({ item, items, lookup, onClose, onOpenPlace }: Props) {
  const [geoStatus, setGeoStatus] = useState<Record<'from' | 'to', string>>({ from: '', to: '' })
  const set = (patch: Partial<TimelineItem>) => saveItem({ ...item, ...patch })
  const setTrain = (patch: Partial<TrainInfo>) => set({ train: { ...item.train!, ...patch } })

  function setDate(date: string | null) {
    const moved = { ...item, date, order: nextOrder(date) }
    const dayItems = items.filter((i) => i.date === date)
    saveItem({ ...moved, order: orderForTime(dayItems, moved) })
  }

  function setTime(time: string) {
    const changed = { ...item, time }
    const dayItems = items.filter((i) => i.date === item.date)
    saveItem({ ...changed, order: orderForTime(dayItems, changed) })
  }

  /** Look up a station / city name so the train leg can be drawn on the map */
  async function locate(end: 'from' | 'to') {
    const name = item.train?.[end].trim()
    if (!name) return
    setGeoStatus((s) => ({ ...s, [end]: 'Finding…' }))
    try {
      const [hit] = await search(name)
      if (!hit) {
        setGeoStatus((s) => ({ ...s, [end]: 'Not found, so this leg won’t show on the map' }))
        return
      }
      // Re-read: the user may have edited other fields while we were searching
      const fresh = getItem(item.id)
      if (!fresh?.train) return
      const coords = end === 'from' ? { fromLat: hit.lat, fromLng: hit.lng } : { toLat: hit.lat, toLng: hit.lng }
      saveItem({ ...fresh, train: { ...fresh.train, ...coords } })
      setGeoStatus((s) => ({ ...s, [end]: '📍 ' + hit.label }))
    } catch {
      setGeoStatus((s) => ({ ...s, [end]: 'Offline. The location will be looked up when you edit this again online.' }))
    }
  }

  const stayKind = item.placeId ? 'place' : item.personId ? 'person' : 'other'

  return (
    <div className="editor">
      <div className="editor-head">
        <button className="ghost" onClick={onClose}>← Back</button>
        <span className="muted">{TYPE_LABEL[item.type]} · saved automatically</span>
      </div>

      <div className="row two">
        <label className="field">
          <span>Day</span>
          <input
            type="date"
            value={item.date ?? ''}
            disabled={item.date === null}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{item.type === 'train' ? 'Departs' : 'Time (optional)'}</span>
          <input type="time" value={item.time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={item.date === null}
          onChange={(e) => setDate(e.target.checked ? null : (item.date ?? today()))}
        />
        Unscheduled (no date yet)
      </label>
      {item.date && <p className="muted small">{formatDay(item.date)}</p>}

      {item.type === 'place' && (
        <div className="field">
          <span>Place</span>
          <select value={item.placeId ?? ''} onChange={(e) => set({ placeId: e.target.value || null })}>
            {[...lookup.places.values()].map((p) => (
              <option key={p.id} value={p.id}>{p.name || 'Unnamed'}</option>
            ))}
          </select>
          {item.placeId && (
            <button className="ghost link-btn" onClick={() => onOpenPlace(item.placeId!)}>
              Open place details →
            </button>
          )}
        </div>
      )}

      {item.type === 'note' && (
        <label className="field">
          <span>Title</span>
          <input value={item.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Laundry" />
        </label>
      )}

      {item.type === 'train' && item.train && (
        <>
          {(['from', 'to'] as const).map((end) => (
            <label key={end} className="field">
              <span>{end === 'from' ? 'From' : 'To'}</span>
              <input
                value={item.train![end]}
                onChange={(e) =>
                  setTrain(
                    end === 'from'
                      ? { from: e.target.value, fromLat: null, fromLng: null }
                      : { to: e.target.value, toLat: null, toLng: null },
                  )
                }
                onBlur={() => {
                  const missing = end === 'from' ? item.train!.fromLat == null : item.train!.toLat == null
                  if (missing) locate(end)
                }}
                placeholder={end === 'from' ? 'e.g. Wien Hbf' : 'e.g. Budapest-Keleti'}
              />
              {geoStatus[end] && <span className="muted small">{geoStatus[end]}</span>}
            </label>
          ))}
          <div className="row two">
            <label className="field">
              <span>Arrives</span>
              <input type="time" value={item.train.arrive} onChange={(e) => setTrain({ arrive: e.target.value })} />
            </label>
            <label className="field">
              <span>Train</span>
              <input
                value={item.train.number}
                onChange={(e) => setTrain({ number: e.target.value })}
                placeholder="e.g. RJX 63"
              />
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={item.train.reservation}
              onChange={(e) => setTrain({ reservation: e.target.checked })}
            />
            Seat reservation needed
          </label>
        </>
      )}

      {item.type === 'stay' && (
        <>
          <div className="field">
            <span>Where</span>
            <div className="segmented">
              <button
                className={stayKind === 'place' ? 'active' : ''}
                onClick={() => set({ placeId: [...lookup.places.keys()][0] ?? null, personId: null })}
                disabled={lookup.places.size === 0}
              >
                Place
              </button>
              <button
                className={stayKind === 'person' ? 'active' : ''}
                onClick={() => set({ personId: [...lookup.people.keys()][0] ?? null, placeId: null })}
                disabled={lookup.people.size === 0}
              >
                Person
              </button>
              <button className={stayKind === 'other' ? 'active' : ''} onClick={() => set({ placeId: null, personId: null })}>
                Other
              </button>
            </div>
          </div>
          {stayKind === 'place' && (
            <select value={item.placeId ?? ''} onChange={(e) => set({ placeId: e.target.value })}>
              {[...lookup.places.values()].map((p) => (
                <option key={p.id} value={p.id}>{p.name || 'Unnamed'}</option>
              ))}
            </select>
          )}
          {stayKind === 'person' && (
            <select value={item.personId ?? ''} onChange={(e) => set({ personId: e.target.value })}>
              {[...lookup.people.values()].map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || 'Unnamed'}{p.city ? ` (${p.city})` : ''}
                </option>
              ))}
            </select>
          )}
          {stayKind === 'other' && (
            <input value={item.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Hostel One Prague" />
          )}
          <label className="field">
            <span>Nights</span>
            <input
              type="number"
              min={1}
              max={60}
              value={item.nights}
              onChange={(e) => set({ nights: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })}
            />
          </label>
        </>
      )}

      <label className="field">
        <span>Notes</span>
        <textarea
          rows={4}
          value={item.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder={item.type === 'train' ? 'Platform, coach, seat…' : 'Anything to remember…'}
        />
      </label>

      <div className="row">
        <button
          className="danger"
          onClick={() => {
            if (confirm(`Delete "${describeItem(item, lookup).title}" from the timeline?`)) {
              deleteItem(item.id)
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
