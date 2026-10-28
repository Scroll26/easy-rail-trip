import { saveStop } from '../store'
import { fitPrevStop, type Lookup, type Trip } from '../trip'

const n = (k: number) => `${k} ${k === 1 ? 'night' : 'nights'}`

/** Warning for a fixed date that doesn't fit the stop before, with a one-tap fix when there is one */
export default function GapNotice({ trip, id, gap, lookup }: { trip: Trip; id: string; gap: number; lookup: Lookup }) {
  if (gap === 0) return null
  const fit = fitPrevStop(trip, id)
  const town = fit ? lookup.places.get(fit.stop.stop.placeId)?.name || 'the stop before' : ''
  return (
    <div className="gap-notice">
      <span className="warn-text small">
        ⚠ {gap > 0 ? `${n(gap)} unplanned before this date.` : `Overlaps the stop before by ${n(-gap)}.`}
      </span>
      {fit && (
        <button className="small-btn" onClick={() => saveStop({ ...fit.stop.stop, nights: fit.nights })}>
          {gap > 0 ? `Stay ${gap} more ${gap === 1 ? 'night' : 'nights'} in ${town}` : `Leave ${town} ${n(-gap)} earlier`}
        </button>
      )}
    </div>
  )
}
