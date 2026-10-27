// Dates are plain 'YYYY-MM-DD' strings; all math is done in UTC so time zones
// and daylight saving can never shift a day.

const toUtc = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * 86400000)

export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86400000)

export const today = () => {
  const now = new Date()
  return fromUtc(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

const fmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "Tue 12 May" */
export const formatDay = (d: string) => fmt.format(toUtc(d))

/** "12 May" */
export const formatShort = (d: string) => fmtShort.format(toUtc(d))
