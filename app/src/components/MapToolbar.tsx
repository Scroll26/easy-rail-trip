import { useEffect, useRef, useState } from 'react'
import { RAIL_TYPES } from '../data/railTypes'
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

  function toggleRailType(id: string) {
    const hidden = settings.hiddenRailTypes
    updateSettings({ hiddenRailTypes: hidden.includes(id) ? hidden.filter((t) => t !== id) : [...hidden, id] })
  }

  const check = (label: React.ReactNode, checked: boolean, onChange: () => void, disabled = false) => (
    <label className={'check' + (disabled ? ' disabled' : '')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      {label}
    </label>
  )

  const mapChanged =
    settings.interrailMode !== 'highlight' ||
    !settings.showRailways ||
    settings.hiddenRailTypes.length > 0 ||
    settings.showStreets ||
    settings.showCurrencies ||
    settings.mapLabels !== 'all'

  return (
    <div className="map-toolbar" ref={ref}>
      {layer('place')}
      {layer('person')}
      <div className="split">
        <button
          className={'split-main' + (menu === 'map' ? ' open' : '')}
          onClick={() => setMenu(menu === 'map' ? null : 'map')}
        >
          🗺️ Map
          {mapChanged && <span className="badge-dot" title="Map settings changed" />}
        </button>
        <button
          className={'split-more' + (menu === 'map' ? ' open' : '')}
          aria-label="Map options"
          onClick={() => setMenu(menu === 'map' ? null : 'map')}
        >
          ▾
        </button>
        {menu === 'map' && (
          <div className="menu menu-right map-menu">
            <div className="menu-title first">🎫 Interrail</div>
            <div className="segmented">
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
            <p className="menu-hint">Countries where the Interrail pass is valid</p>

            <div className="menu-title">🛤️ Railway lines</div>
            {check(<b>Show railway lines</b>, settings.showRailways, () => updateSettings({ showRailways: !settings.showRailways }))}
            <div className={'rail-types' + (settings.showRailways ? '' : ' off')}>
              {RAIL_TYPES.map((t) => (
                <label key={t.id} className="check rail-type">
                  <input
                    type="checkbox"
                    disabled={!settings.showRailways}
                    checked={!settings.hiddenRailTypes.includes(t.id)}
                    onChange={() => toggleRailType(t.id)}
                  />
                  <span className="rail-swatch" style={{ background: t.color }} />
                  <span>
                    {t.label}
                    <span className="menu-hint">{t.hint}</span>
                  </span>
                </label>
              ))}
              <label className="check rail-type">
                <input
                  type="checkbox"
                  disabled={!settings.showRailways}
                  checked={settings.showStations}
                  onChange={() => updateSettings({ showStations: !settings.showStations })}
                />
                <span className="station-swatch" />
                <span>
                  Stations
                  <span className="menu-hint">tap one for its name and direct trains</span>
                </span>
              </label>
            </div>

            <div className="menu-title">⚙️ Other</div>
            <div className="menu-sub">Map text</div>
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
            {check('🛣️ Streets', settings.showStreets, () => updateSettings({ showStreets: !settings.showStreets }))}
            {check('💱 Currencies', settings.showCurrencies, () => updateSettings({ showCurrencies: !settings.showCurrencies }))}
            {check('🎨 Pins in group colours', settings.colorPlacesByGroup && settings.colorPeopleByGroup, () => {
              const on = !(settings.colorPlacesByGroup && settings.colorPeopleByGroup)
              updateSettings({ colorPlacesByGroup: on, colorPeopleByGroup: on })
            })}
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
