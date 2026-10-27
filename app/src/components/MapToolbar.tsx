import { useEffect, useRef, useState } from 'react'
import { updateSettings } from '../store'
import { NO_GROUP, type Group, type InterrailMode, type Settings } from '../types'

const IR_MODES: { mode: InterrailMode; label: string }[] = [
  { mode: 'highlight', label: 'Highlight' },
  { mode: 'dim', label: 'Dim others' },
  { mode: 'off', label: 'Off' },
]

const LABEL_MODES: { mode: Settings['mapLabels']; label: string }[] = [
  { mode: 'all', label: 'All' },
  { mode: 'countries', label: 'Countries' },
  { mode: 'none', label: 'None' },
]

interface Props {
  settings: Settings
  groups: Group[]
  ratesNote: string | null
}

export default function MapToolbar({ settings, groups, ratesNote }: Props) {
  const [menu, setMenu] = useState<'place' | 'person' | 'map' | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Close the menu on any click outside the toolbar
  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  function toggleGroup(id: string) {
    const hidden = settings.hiddenGroups
    updateSettings({ hiddenGroups: hidden.includes(id) ? hidden.filter((g) => g !== id) : [...hidden, id] })
  }

  const layer = (kind: 'place' | 'person') => {
    const isPlace = kind === 'place'
    const shown = isPlace ? settings.showPlaces : settings.showPeople
    const labels = isPlace ? settings.showPlaceLabels : settings.showPeopleLabels
    const byGroup = isPlace ? settings.colorPlacesByGroup : settings.colorPeopleByGroup
    const kindGroups = groups.filter((g) => g.kind === kind)
    const noGroupKey = `${NO_GROUP}:${kind}`
    const hiddenCount = [...kindGroups.map((g) => g.id), noGroupKey].filter((id) => settings.hiddenGroups.includes(id)).length
    return (
      <div className="split">
        <button
          className={'split-main' + (shown ? ' active' : '')}
          onClick={() => updateSettings(isPlace ? { showPlaces: !shown } : { showPeople: !shown })}
        >
          {isPlace ? '📍 Places' : '🧑 People'}
          {shown && hiddenCount > 0 && <span className="badge-dot" title="Some groups hidden" />}
        </button>
        <button
          className={'split-more' + (menu === kind ? ' open' : '')}
          aria-label={`${isPlace ? 'Places' : 'People'} options`}
          onClick={() => setMenu(menu === kind ? null : kind)}
        >
          ▾
        </button>
        {menu === kind && (
          <div className="menu">
            <label className="check">
              <input
                type="checkbox"
                checked={shown}
                onChange={() => updateSettings(isPlace ? { showPlaces: !shown } : { showPeople: !shown })}
              />
              Show on map
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={labels}
                onChange={() => updateSettings(isPlace ? { showPlaceLabels: !labels } : { showPeopleLabels: !labels })}
              />
              Names
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={byGroup}
                onChange={() =>
                  updateSettings(isPlace ? { colorPlacesByGroup: !byGroup } : { colorPeopleByGroup: !byGroup })
                }
              />
              Colour pins by group
            </label>
            <div className="menu-title">Groups</div>
            {kindGroups.map((g) => (
              <label key={g.id} className="check">
                <input type="checkbox" checked={!settings.hiddenGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                <span className="group-dot" style={{ background: g.color }} />
                {g.name}
              </label>
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={!settings.hiddenGroups.includes(noGroupKey)}
                onChange={() => toggleGroup(noGroupKey)}
              />
              <span className="group-dot empty" />
              No group
            </label>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="map-toolbar" ref={ref}>
      <div className="segmented compact" title="Interrail area">
        <span className="seg-label">🚆 Interrail</span>
        {IR_MODES.map((m) => (
          <button
            key={m.mode}
            className={settings.interrailMode === m.mode ? 'active' : ''}
            onClick={() => updateSettings({ interrailMode: m.mode })}
          >
            {m.label}
          </button>
        ))}
      </div>
      {layer('place')}
      {layer('person')}
      <div className="split">
        <button
          className={'split-main' + (menu === 'map' ? ' open' : '')}
          onClick={() => setMenu(menu === 'map' ? null : 'map')}
        >
          🗺️ Map
          {(settings.showCurrencies || settings.mapLabels !== 'all') && <span className="badge-dot" />}
        </button>
        <button
          className={'split-more' + (menu === 'map' ? ' open' : '')}
          aria-label="Map options"
          onClick={() => setMenu(menu === 'map' ? null : 'map')}
        >
          ▾
        </button>
        {menu === 'map' && (
          <div className="menu menu-right">
            <div className="menu-title first">Map text</div>
            <div className="segmented">
              {LABEL_MODES.map((m) => (
                <button
                  key={m.mode}
                  className={settings.mapLabels === m.mode ? 'active' : ''}
                  onClick={() => updateSettings({ mapLabels: m.mode })}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="menu-title">Overlays</div>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.showCurrencies}
                onChange={() => updateSettings({ showCurrencies: !settings.showCurrencies })}
              />
              💱 Currencies
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.colorPlacesByGroup && settings.colorPeopleByGroup}
                onChange={() => {
                  const on = !(settings.colorPlacesByGroup && settings.colorPeopleByGroup)
                  updateSettings({ colorPlacesByGroup: on, colorPeopleByGroup: on })
                }}
              />
              🎨 Pins in group colours
            </label>
          </div>
        )}
      </div>
      {settings.showCurrencies && (
        <div className="rates-note">
          <span className="euro-swatch" /> Euro · others: 1 € in local currency{ratesNote ? ` · ${ratesNote}` : ''}
        </div>
      )}
    </div>
  )
}
