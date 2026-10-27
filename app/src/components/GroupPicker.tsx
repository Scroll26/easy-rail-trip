import { useState } from 'react'
import { deleteGroup, newId, saveGroup } from '../store'
import type { Group } from '../types'

const GROUP_COLORS = [
  '#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0891b2',
  '#ca8a04', '#dc2626', '#0f766e', '#9333ea', '#65a30d', '#475569',
]

interface Props {
  kind: 'place' | 'person'
  itemName: string
  current: string | null
  groups: Group[]
  /** Members per group id, for the counts */
  counts: Map<string, number>
  onPick: (groupId: string | null) => void
  onClose: () => void
}

export default function GroupPicker({ kind, itemName, current, groups, counts, onPick, onClose }: Props) {
  const [name, setName] = useState('')
  const [colorFor, setColorFor] = useState<string | null>(null)

  function create(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = groups.find((g) => g.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      onPick(existing.id)
      return
    }
    const group: Group = {
      id: newId(),
      kind,
      name: trimmed,
      color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
      createdAt: Date.now(),
    }
    saveGroup(group)
    onPick(group.id)
  }

  return (
    <div className="picker">
      <div className="editor-head">
        <button className="ghost" onClick={onClose}>← Back</button>
        <span className="muted ellipsis">Group for {itemName || 'Unnamed'}</span>
      </div>

      <form className="row new-group" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New group, e.g. Museums" />
        <button className="primary" type="submit" disabled={!name.trim()}>+ Create</button>
      </form>

      <ul className="list">
        <li className={current == null ? 'highlighted' : ''}>
          <button className="item" onClick={() => onPick(null)}>
            <span className="group-dot empty" />
            <span className="item-main">
              <strong>No group</strong>
            </span>
            {current == null && <span className="check-mark">✓</span>}
          </button>
        </li>
        {groups.length === 0 && (
          <li className="empty">No groups yet. Create one above.</li>
        )}
        {groups.map((g) => [
          <li key={g.id} className={current === g.id ? 'highlighted' : ''}>
            <button
              className="swatch-btn"
              title="Change colour"
              aria-label={`Colour of ${g.name}`}
              onClick={() => setColorFor(colorFor === g.id ? null : g.id)}
            >
              <span className="swatch" style={{ background: g.color }} />
            </button>
            <button className="item" onClick={() => onPick(g.id)}>
              <span className="item-main">
                <strong>{g.name}</strong>
                <span className="muted small">
                  {counts.get(g.id) ?? 0} {kind === 'place' ? 'places' : 'people'}
                </span>
              </span>
              {current === g.id && <span className="check-mark">✓</span>}
            </button>
            <button
              className="icon-btn danger"
              title="Delete group"
              onClick={() => {
                if (confirm(`Delete the group "${g.name}"? Its members stay, just without a group.`)) deleteGroup(g.id)
              }}
            >
              🗑️
            </button>
          </li>,
          colorFor === g.id && (
            <li key={g.id + '-colors'} className="palette">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  className={'swatch' + (c === g.color ? ' current' : '')}
                  style={{ background: c }}
                  aria-label={c}
                  onClick={() => {
                    saveGroup({ ...g, color: c })
                    setColorFor(null)
                  }}
                />
              ))}
              <label className="swatch custom" title="Custom colour">
                <input type="color" value={g.color} onChange={(e) => saveGroup({ ...g, color: e.target.value })} />
                ＋
              </label>
            </li>
          ),
        ])}
      </ul>
    </div>
  )
}
