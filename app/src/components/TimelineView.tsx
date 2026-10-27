import { useMemo, useState } from 'react'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { addDays, formatDay, formatShort, today } from '../dates'
import { deleteDay, deleteItem, saveDay, saveItem } from '../store'
import { between, buildRows, describeItem, newItem, UNSCHEDULED, type Lookup } from '../timeline'
import type { DayInfo, ItemType, TimelineItem } from '../types'

interface Props {
  items: TimelineItem[]
  days: Record<string, DayInfo>
  lookup: Lookup
  mapDay: string | null
  highlightId: string | null
  onMapDay: (date: string | null) => void
  onEdit: (id: string) => void
  onShow: (item: TimelineItem) => void
}

type Picker = { date: string | null; type: 'place' | 'stay' } | null

const containerId = (date: string | null) => 'c:' + (date ?? UNSCHEDULED)
const dateOf = (container: string) => {
  const d = container.slice(2)
  return d === UNSCHEDULED ? null : d
}

export default function TimelineView({ items, days, lookup, mapDay, highlightId, onMapDay, onEdit, onShow }: Props) {
  const rows = useMemo(() => buildRows(items, days), [items, days])
  const unscheduled = items.filter((i) => i.date === null)
  const lastDate = [...rows].reverse().find((r) => r.kind === 'day')?.date
  const [newDate, setNewDate] = useState(lastDate ? addDays(lastDate, 1) : today())
  const [picker, setPicker] = useState<Picker>(null)
  const [pickerFilter, setPickerFilter] = useState('')
  const [dragging, setDragging] = useState<TimelineItem | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function addDay() {
    if (!newDate) return
    if (!days[newDate]) saveDay({ date: newDate, title: '' })
    setNewDate(addDays(newDate, 1))
  }

  function add(type: ItemType, date: string | null) {
    if (type === 'place' || type === 'stay') {
      setPicker({ date, type })
      setPickerFilter('')
      return
    }
    const item = newItem(type, date)
    saveItem(item)
    onEdit(item.id)
  }

  function pickTarget(patch: Partial<TimelineItem>) {
    if (!picker) return
    const item = newItem(picker.type, picker.date, patch)
    saveItem(item)
    setPicker(null)
    // A new stay usually needs its number of nights set
    if (picker.type === 'stay') onEdit(item.id)
  }

  function onDragStart(e: DragStartEvent) {
    setDragging(items.find((i) => i.id === e.active.id) ?? null)
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null)
    const item = items.find((i) => i.id === active.id)
    if (!item || !over || over.id === active.id) return
    const overId = String(over.id)
    const target: string = overId.startsWith('c:')
      ? overId
      : (over.data.current?.sortable?.containerId ?? containerId(items.find((i) => i.id === overId)?.date ?? null))
    const date = dateOf(target)
    const list = items.filter((i) => i.date === date && i.id !== item.id)

    let index = list.length
    if (!overId.startsWith('c:')) {
      const overIndex = list.findIndex((i) => i.id === overId)
      const overItem = list[overIndex]
      // Moving down inside the same day: drop after the hovered item
      const movingDown = item.date === date && overItem && item.order < overItem.order
      index = overIndex + (movingDown ? 1 : 0)
    }
    saveItem({ ...item, date, order: between(list[index - 1]?.order, list[index]?.order) })
  }

  const renderItems = (list: TimelineItem[], date: string | null) => (
    <ItemList
      id={containerId(date)}
      items={list}
      lookup={lookup}
      highlightId={highlightId}
      onEdit={onEdit}
      onShow={onShow}
      onAdd={(type) => add(type, date)}
    />
  )

  const pickerQuery = pickerFilter.trim().toLowerCase()
  const matches = (s: string) => !pickerQuery || s.toLowerCase().includes(pickerQuery)
  const pickerPlaces = [...lookup.places.values()]
    .filter((p) => matches(p.name))
    .sort((a, b) => (picker?.type === 'stay' ? Number(b.category === 'stay') - Number(a.category === 'stay') : 0))
  const pickerPeople = [...lookup.people.values()]
    .filter((p) => matches(p.name + ' ' + p.city))
    .sort((a, b) => Number(b.canStay) - Number(a.canStay))

  if (picker)
    return (
      <div className="picker">
        <div className="editor-head">
          <button className="ghost" onClick={() => setPicker(null)}>← Back</button>
          <span className="muted">
            {picker.type === 'place' ? 'Add a place' : 'Where do you sleep?'} ·{' '}
            {picker.date ? formatDay(picker.date) : 'Unscheduled'}
          </span>
        </div>
        <input value={pickerFilter} onChange={(e) => setPickerFilter(e.target.value)} placeholder="Filter…" autoFocus />
        {picker.type === 'stay' && (
          <button className="item picker-other" onClick={() => pickTarget({})}>
            🛏️ Somewhere else (type the name)
          </button>
        )}
        {picker.type === 'stay' && pickerPeople.length > 0 && <h4>People</h4>}
        {picker.type === 'stay' && (
          <ul className="list">
            {pickerPeople.map((p) => (
              <li key={p.id}>
                <button className="item" onClick={() => pickTarget({ personId: p.id })}>
                  <span className="item-icon person">{(p.name || '?')[0].toUpperCase()}</span>
                  <span className="item-main">
                    <strong>{p.name || 'Unnamed'}</strong>
                    <span className="muted small">{p.city}{p.canStay ? ' · 🛏️ can stay' : ''}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {picker.type === 'stay' && <h4>Places</h4>}
        <ul className="list">
          {pickerPlaces.length === 0 && (
            <li className="empty">No places found. Add places in the Places tab first.</li>
          )}
          {pickerPlaces.map((p) => {
            const v = describeItem({ ...newItem('place', null), placeId: p.id }, lookup)
            return (
              <li key={p.id}>
                <button className="item" onClick={() => pickTarget({ placeId: p.id })}>
                  <span className="item-icon plain">{v.icon}</span>
                  <span className="item-main">
                    <strong>{p.name || 'Unnamed'}</strong>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )

  return (
    <div className="timeline">
      <div className="row add-day">
        <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        <button className="primary" onClick={addDay}>+ Day</button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <section className="day unscheduled">
          <header className="day-head">
            <div>
              <strong>Unscheduled</strong>
              <span className="muted small"> · ideas without a date ({unscheduled.length})</span>
            </div>
          </header>
          {renderItems(unscheduled, null)}
        </section>

        {rows.length === 0 && (
          <p className="empty muted">
            No days yet. Pick a date and tap <b>+ Day</b>. Only days you add appear here, so long trips stay short.
          </p>
        )}

        {rows.map((row) =>
          row.kind === 'gap' ? (
            <div key={'gap' + row.from} className="gap">
              <span>
                {row.count === 1 ? '1 day' : `${row.count} days`} ({formatShort(row.from)}
                {row.count > 1 ? ` – ${formatShort(addDays(row.from, row.count - 1))}` : ''})
              </span>
              <span>
                {row.stay
                  ? `🛏️ ${describeItem(row.stay, lookup).title} · until ${formatShort(addDays(row.stay.date!, row.stay.nights))}`
                  : 'nothing planned'}
              </span>
            </div>
          ) : (
            <section key={row.date} className={'day' + (mapDay === row.date ? ' on-map' : '')}>
              <header className="day-head">
                <div className="day-date">
                  <strong>Day {row.dayNumber}</strong>
                  <span className="muted"> · {formatDay(row.date)}</span>
                </div>
                <button
                  className={'icon-btn' + (mapDay === row.date ? ' active' : '')}
                  title={mapDay === row.date ? 'Show all on map' : 'Show only this day on the map'}
                  onClick={() => onMapDay(mapDay === row.date ? null : row.date)}
                >
                  🗺️
                </button>
                <button
                  className="icon-btn danger"
                  title="Delete day"
                  onClick={() => {
                    const n = row.items.length
                    if (confirm(`Delete ${formatDay(row.date)}?${n ? ` Its ${n} entries move to Unscheduled.` : ''}`)) {
                      deleteDay(row.date)
                      if (mapDay === row.date) onMapDay(null)
                    }
                  }}
                >
                  🗑️
                </button>
              </header>
              <input
                className="day-title"
                value={days[row.date]?.title ?? ''}
                onChange={(e) => saveDay({ date: row.date, title: e.target.value })}
                placeholder="Title, e.g. Vienna → Budapest"
              />
              {row.continuingStay && (
                <p className="continuing muted small">
                  🛏️ Night {row.continuingStay.night}/{row.continuingStay.item.nights} ·{' '}
                  {describeItem(row.continuingStay.item, lookup).title}
                </p>
              )}
              {renderItems(row.items, row.date)}
            </section>
          ),
        )}

        <DragOverlay>
          {dragging && <ItemRowView item={dragging} lookup={lookup} overlay />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function ItemList({
  id,
  items,
  lookup,
  highlightId,
  onEdit,
  onShow,
  onAdd,
}: {
  id: string
  items: TimelineItem[]
  lookup: Lookup
  highlightId: string | null
  onEdit: (id: string) => void
  onShow: (item: TimelineItem) => void
  onAdd: (type: ItemType) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <>
      <SortableContext id={id} items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={'list day-items' + (isOver ? ' drop-over' : '')}>
          {items.length === 0 && <li className="drop-hint muted small">Drop entries here</li>}
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              lookup={lookup}
              highlighted={highlightId === item.id}
              onEdit={onEdit}
              onShow={onShow}
            />
          ))}
        </ul>
      </SortableContext>
      <div className="add-bar">
        <button onClick={() => onAdd('place')}>+ Place</button>
        <button onClick={() => onAdd('train')}>+ Train</button>
        <button onClick={() => onAdd('stay')}>+ Stay</button>
        <button onClick={() => onAdd('note')}>+ Note</button>
      </div>
    </>
  )
}

function SortableItem({
  item,
  lookup,
  highlighted,
  onEdit,
  onShow,
}: {
  item: TimelineItem
  lookup: Lookup
  highlighted: boolean
  onEdit: (id: string) => void
  onShow: (item: TimelineItem) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className={highlighted ? 'highlighted' : ''}
    >
      <button ref={setActivatorNodeRef} className="drag-handle" aria-label="Drag to move" {...attributes} {...listeners}>
        ⠿
      </button>
      <ItemRowView item={item} lookup={lookup} onClick={() => onShow(item)} />
      <button className="icon-btn" title="Edit" onClick={() => onEdit(item.id)}>✏️</button>
      <button
        className="icon-btn danger"
        title="Delete"
        onClick={() => {
          if (confirm(`Delete "${describeItem(item, lookup).title}" from the timeline?`)) deleteItem(item.id)
        }}
      >
        🗑️
      </button>
    </li>
  )
}

function ItemRowView({
  item,
  lookup,
  onClick,
  overlay,
}: {
  item: TimelineItem
  lookup: Lookup
  onClick?: () => void
  overlay?: boolean
}) {
  const v = describeItem(item, lookup)
  return (
    <button className={'item' + (overlay ? ' drag-overlay' : '')} onClick={onClick}>
      {item.time && <span className="item-time">{item.time}</span>}
      <span className={'item-icon plain type-' + item.type}>{v.icon}</span>
      <span className="item-main">
        <strong className="ellipsis">{v.title}</strong>
        {v.subtitle && <span className="muted small ellipsis">{v.subtitle}</span>}
      </span>
    </button>
  )
}
