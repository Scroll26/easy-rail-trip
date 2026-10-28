import { Fragment, useEffect, useRef, useState } from 'react'
import { RAIL_TYPES } from '../data/railTypes'
import { FERRY_STYLE } from '../data/ferries'
import { DEFAULT_TRIP_VIEW, updateSettings } from '../store'
import { NO_GROUP, type Group, type InterrailMode, type Settings, type TripViewOptions } from '../types'

const IR_MODES: { mode: InterrailMode; label: string }[] = [
  { mode: 'highlight', label: 'Highlight' },
  { mode: 'dim', label: 'Dim others' },
  { mode: 'off', label: 'Off' },
]

/** The switches of the View trip menu, in order */
const TRIP_VIEW_ITEMS: { key: Exclude<keyof TripViewOptions, 'mapLabels'>; label: string }[] = [
  { key: 'places', label: '📍 Places' },
  { key: 'people', label: '🧑 People' },
  { key: 'pinNames', label: '🏷️ Names of pins' },
  { key: 'connections', label: '〰️ Trip connections' },
  { key: 'interrail', label: '🎫 Interrail countries' },
  { key: 'railways', label: '🛤️ Railway lines' },
  { key: 'ferries', label: '⛴️ Ferries' },
  { key: 'streets', label: '🛣️ Streets' },
  { key: 'currencies', label: '💱 Currencies' },
  { key: 'directTrains', label: '🚆 Direct-train results' },
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
  const [menu, setMenu] = useState<'trip' | 'place' | 'person' | 'map' | null>(null)
  // On phones the menus span the screen just below the (wrapping) toolbar
  const [menuTop, setMenuTop] = useState(0)
  useEffect(() => {
    if (menu && ref.current) setMenuTop(Math.round(ref.current.getBoundingClientRect().bottom + 6))
  }, [menu])
  const menuStyle = { '--menu-top': `${menuTop}px` } as React.CSSProperties
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
    // While View trip is on, these buttons switch its own Places / People options
    const viewTrip = settings.simpleView
    const shown = viewTrip ? settings.tripView[kind === 'place' ? 'places' : 'people'] : isPlace ? settings.showPlaces : settings.showPeople
    const toggleShown = () =>
      viewTrip
        ? updateSettings({ tripView: { ...settings.tripView, [isPlace ? 'places' : 'people']: !shown } })
        : updateSettings(isPlace ? { showPlaces: !shown } : { showPeople: !shown })
    const labels = isPlace ? settings.showPlaceLabels : settings.showPeopleLabels
    const byGroup = isPlace ? settings.colorPlacesByGroup : settings.colorPeopleByGroup
    const kindGroups = groups.filter((g) => g.kind === kind)
    const noGroupKey = `${NO_GROUP}:${kind}`
    const hiddenCount = [...kindGroups.map((g) => g.id), noGroupKey].filter((id) => settings.hiddenGroups.includes(id)).length
    return (
      <div className="split">
        <button
          className={'split-main' + (shown ? ' active' : '')}
          onClick={toggleShown}
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
          <div className="menu" style={menuStyle}>
            <label className="check">
              <input
                type="checkbox"
                checked={shown}
                onChange={toggleShown}
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

  const tv = settings.tripView
  const setTripView = (patch: Partial<TripViewOptions>) => updateSettings({ tripView: { ...tv, ...patch } })
  const tripViewChanged = (Object.keys(DEFAULT_TRIP_VIEW) as (keyof TripViewOptions)[]).some((k) => tv[k] !== DEFAULT_TRIP_VIEW[k])

  return (
    <div className="map-toolbar" ref={ref}>
      <div className={'split view-trip' + (settings.simpleView ? ' on' : '')}>
        <button
          className={'split-main' + (settings.simpleView ? ' active' : '')}
          onClick={() => updateSettings({ simpleView: !settings.simpleView })}
          title="Clean map with only your pins and what you choose under ▾"
          aria-pressed={settings.simpleView}
        >
          🧳 View trip
        </button>
        <button
          className={'split-more' + (menu === 'trip' ? ' open' : '')}
          aria-label="View trip options"
          onClick={() => setMenu(menu === 'trip' ? null : 'trip')}
        >
          ▾
        </button>
        {menu === 'trip' && (
          <div className="menu" style={menuStyle}>
            <div className="menu-title first">While View trip is on, show</div>
            {TRIP_VIEW_ITEMS.map((i) => (
              <Fragment key={i.key}>{check(i.label, tv[i.key], () => setTripView({ [i.key]: !tv[i.key] }))}</Fragment>
            ))}
            <div className="menu-sub">Map text</div>
            <div className="segmented">
              {LABEL_MODES.map((m) => (
                <button key={m.mode} className={tv.mapLabels === m.mode ? 'active' : ''} onClick={() => setTripView({ mapLabels: m.mode })}>
                  {m.label}
                </button>
              ))}
            </div>
            <p className="menu-hint">Everything else comes back when you turn View trip off.</p>
            <button className="ghost small" disabled={!tripViewChanged} onClick={() => updateSettings({ tripView: DEFAULT_TRIP_VIEW })}>
              Reset to default
            </button>
          </div>
        )}
      </div>
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
          <div className="menu menu-right map-menu" style={menuStyle}>
            {settings.simpleView && (
              <p className="simple-note">
                🧳 View trip is on, so it decides what's shown (choose under its ▾).{' '}
                <button className="ghost small" onClick={() => updateSettings({ simpleView: false })}>Turn off</button>
              </p>
            )}
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

            <div className="menu-title">⛴️ Ferries</div>
            <div className="rail-types">
              {(['included', 'discount'] as const).map((k) => {
                const key = k === 'included' ? 'showFerriesIncluded' : 'showFerriesDiscount'
                return (
                  <label key={k} className="check rail-type">
                    <input type="checkbox" checked={settings[key]} onChange={() => updateSettings({ [key]: !settings[key] })} />
                    <span className={'ferry-swatch ' + k} style={{ borderColor: FERRY_STYLE[k].color }} />
                    <span>
                      {FERRY_STYLE[k].label}
                      <span className="menu-hint">{FERRY_STYLE[k].hint}</span>
                    </span>
                  </label>
                )
              })}
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
            {check('〰️ Trip connections', settings.showTravelLines, () => updateSettings({ showTravelLines: !settings.showTravelLines }))}
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
