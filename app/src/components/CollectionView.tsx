import { useMemo, useState } from 'react'
import { CATEGORIES, STATUSES } from '../data/categories'
import { listOrder, savePerson, savePlace } from '../store'
import { between } from '../timeline'
import { NO_GROUP, type Group, type Person, type Place } from '../types'
import GroupPicker from './GroupPicker'
import SortableRows from './SortableRows'

type Item = Place | Person

interface Props {
  kind: 'place' | 'person'
  items: Item[]
  groups: Group[]
  /** Country of each item (by id), when it is on the map */
  countryOf: Map<string, { iso: string; name: string }>
  highlightId: string | null
  /** Show items in their group's colour (same setting as the map pins) */
  colorByGroup: boolean
  onShow: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (item: Item) => void
  onAdd: () => void
}

const ALL = '__all'

export default function CollectionView({
  kind,
  items,
  groups,
  countryOf,
  highlightId,
  colorByGroup,
  onShow,
  onEdit,
  onDelete,
  onAdd,
}: Props) {
  const [text, setText] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [groupFilter, setGroupFilter] = useState(ALL)
  const [countryFilter, setCountryFilter] = useState(ALL)
  const [groupFor, setGroupFor] = useState<Item | null>(null)

  const isPlace = kind === 'place'
  const kindGroups = groups.filter((g) => g.kind === kind)
  const groupById = new Map(kindGroups.map((g) => [g.id, g]))
  const save = (item: Item) => (isPlace ? savePlace(item as Place) : savePerson(item as Person))

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of items) if (i.groupId) m.set(i.groupId, (m.get(i.groupId) ?? 0) + 1)
    return m
  }, [items])

  // Countries that actually occur, for the filter chips
  const countries = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) {
      const c = countryOf.get(i.id)
      if (c) m.set(c.iso, c.name)
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [items, countryOf])

  const q = text.trim().toLowerCase()
  const shown = items.filter((i) => {
    if (groupFilter !== ALL && (i.groupId ?? NO_GROUP) !== groupFilter) return false
    if (countryFilter !== ALL && countryOf.get(i.id)?.iso !== countryFilter) return false
    if (!q) return true
    const haystack = isPlace ? `${i.name} ${(i as Place).notes}` : `${i.name} ${(i as Person).city}`
    return haystack.toLowerCase().includes(q)
  })
  const activeFilters = Number(groupFilter !== ALL) + Number(countryFilter !== ALL)

  if (groupFor) {
    const current = items.find((i) => i.id === groupFor.id) ?? groupFor
    return (
      <GroupPicker
        kind={kind}
        itemName={current.name}
        current={current.groupId ?? null}
        groups={kindGroups}
        counts={counts}
        onPick={(groupId) => {
          save({ ...current, groupId })
          setGroupFor(null)
        }}
        onClose={() => setGroupFor(null)}
      />
    )
  }

  const chip = (value: string, selected: string, set: (v: string) => void, label: React.ReactNode) => (
    <button key={value} className={'chip' + (selected === value ? ' active' : '')} onClick={() => set(value)}>
      {label}
    </button>
  )

  return (
    <>
      <div className="row list-head">
        <input
          className="filter"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isPlace ? `Filter ${items.length} places` : `Filter ${items.length} people`}
        />
        <button
          className={'icon-btn filter-btn' + (showFilters || activeFilters ? ' active' : '')}
          title="Filter by group or country"
          onClick={() => setShowFilters(!showFilters)}
        >
          ⚲{activeFilters > 0 && <span className="count">{activeFilters}</span>}
        </button>
        <button className="primary" onClick={onAdd}>{isPlace ? '+ Place' : '+ Person'}</button>
      </div>

      {showFilters && (
        <div className="filters">
          <div className="filter-row">
            <span className="muted small">Group</span>
            <div className="chips">
              {chip(ALL, groupFilter, setGroupFilter, 'All')}
              {kindGroups.map((g) =>
                chip(g.id, groupFilter, setGroupFilter, (
                  <>
                    <span className="group-dot" style={{ background: g.color }} /> {g.name}
                  </>
                )),
              )}
              {chip(NO_GROUP, groupFilter, setGroupFilter, 'No group')}
            </div>
          </div>
          <div className="filter-row">
            <span className="muted small">Country</span>
            <div className="chips">
              {chip(ALL, countryFilter, setCountryFilter, 'All')}
              {countries.map(([iso, name]) => chip(iso, countryFilter, setCountryFilter, name))}
            </div>
          </div>
          {activeFilters > 0 && (
            <button
              className="ghost small"
              onClick={() => {
                setGroupFilter(ALL)
                setCountryFilter(ALL)
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {items.length === 0 && (
        <p className="empty muted">
          {isPlace
            ? 'No places yet. Tap + Place and then the map, or search above.'
            : 'Add the people you want to visit. They get their own markers on the map.'}
        </p>
      )}
      {items.length > 0 && shown.length === 0 && <p className="empty muted">Nothing matches the filter.</p>}

      <SortableRows
        items={shown}
        rowClass={(i) => (highlightId === i.id ? 'highlighted' : '')}
        onMove={(item, prev, next) =>
          save({ ...item, order: between(prev && listOrder(prev), next && listOrder(next)) })
        }
        renderRow={(i, handle) => {
          const group = i.groupId ? groupById.get(i.groupId) : undefined
          const groupColor = colorByGroup ? group?.color : undefined
          const country = countryOf.get(i.id)?.name
          let icon: React.ReactNode
          let sub: string[]
          if (isPlace) {
            const p = i as Place
            icon = (
              <span className="item-icon" style={{ background: groupColor ?? STATUSES[p.status].color }}>
                {CATEGORIES[p.category].icon}
              </span>
            )
            sub = [STATUSES[p.status].label, country ?? '', p.notes]
          } else {
            const p = i as Person
            icon = (
              <span className="item-icon person" style={groupColor ? { background: groupColor } : undefined}>
                {(p.name || '?')[0].toUpperCase()}
              </span>
            )
            sub = [p.city || 'No city', p.canStay ? '🛏️ can stay' : '', p.lat == null ? 'not on map' : '']
          }
          return (
            <>
              <button
                ref={handle.ref}
                className="drag-handle"
                aria-label="Drag to reorder"
                {...handle.attributes}
                {...handle.listeners}
              >
                ⠿
              </button>
              <button className="item" onClick={() => onShow(i.id)}>
                {icon}
                <span className="item-main">
                  <strong className="ellipsis">{i.name || 'Unnamed'}</strong>
                  <span className="muted small ellipsis">
                    {group && (
                      <span className="group-tag">
                        <span className="group-dot" style={{ background: group.color }} />
                        {group.name}
                      </span>
                    )}
                    {sub.filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
              <button
                className={'icon-btn' + (group ? ' has-group' : '')}
                title={group ? `Group: ${group.name}` : 'Set group'}
                aria-label={`Group of ${i.name}`}
                onClick={() => setGroupFor(i)}
                style={group ? ({ '--group': group.color } as React.CSSProperties) : undefined}
              >
                🗂️
              </button>
              <button className="icon-btn" title="Edit" aria-label={`Edit ${i.name}`} onClick={() => onEdit(i.id)}>
                ✏️
              </button>
              <button className="icon-btn danger" title="Delete" aria-label={`Delete ${i.name}`} onClick={() => onDelete(i)}>
                🗑️
              </button>
            </>
          )
        }}
      />
    </>
  )
}
