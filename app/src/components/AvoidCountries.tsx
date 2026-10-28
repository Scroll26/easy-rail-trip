import { useCountries } from '../countries'

/** Countries to stay out of: removable chips plus a list to add one */
export default function AvoidCountries({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const shapes = useCountries()
  const name = (iso: string) => shapes.find((c) => c.iso === iso)?.name ?? iso
  const rest = shapes.filter((c) => !value.includes(c.iso)).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="avoid-countries">
      {value.map((iso) => (
        <span key={iso} className="avoid-chip">
          🚫 {name(iso)}
          <button className="ghost" aria-label={`Don't avoid ${name(iso)}`} onClick={() => onChange(value.filter((c) => c !== iso))}>
            ✕
          </button>
        </span>
      ))}
      <select value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])} aria-label="Add a country to avoid">
        <option value="">{value.length ? '+ Another country' : '+ Add a country'}</option>
        {rest.map((c) => (
          <option key={c.iso} value={c.iso}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  )
}

