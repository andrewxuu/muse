import { useEffect, useState } from 'react'
import { dayTip, useChartTooltip, weekTip } from '../ui/ChartTooltip'
import { buildWeeks, moodLabel, scoreMood, startOfToday, weekAverage } from '../../lib/moodMonth'

const moodFill = {
  great: 'fill-mood-great',
  good: 'fill-mood-good',
  okay: 'fill-mood-okay',
  low: 'fill-mood-low',
  awful: 'fill-mood-awful',
}

const H = 220
const MIN_WIDTH = 260
const LEFT = 78
const FONT = 11
const TOP = 8
const BOTTOM = 22
const y = (score) => TOP + (H - TOP - BOTTOM) * (1 - score / 5)

export default function MoodDaily({ monthStart }) {
  const today = startOfToday()
  const weeks = buildWeeks(monthStart, today)
  const days = weeks.flat().filter(Boolean)
  const { ref, bind, tooltip } = useChartTooltip()
  const [width, setWidth] = useState(720)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(([entry]) => setWidth(Math.max(MIN_WIDTH, Math.round(entry.contentRect.width))))
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])

  const W = width
  const slot = (W - LEFT) / days.length
  const x = (day) => LEFT + (day - 1) * slot
  const ticks = [1, 8, 15, 22, 29].filter((d) => d <= days.length)

  return (
    <div ref={ref} className="relative">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto w-full" role="img" aria-label="Daily stress with weekly average line">
      {[1, 2, 3, 4, 5].map((score) => (
        <g key={score}>
          <line x1={LEFT} x2={W} y1={y(score)} y2={y(score)} strokeWidth="1" className="stroke-track" />
          <text x="0" y={y(score) + 4} fontSize={FONT} className="fill-muted">
            {moodLabel(scoreMood[score])}
          </text>
        </g>
      ))}

      <line x1={LEFT} x2={W} y1={y(0)} y2={y(0)} strokeWidth="1" className="stroke-line" />

      {days.map(({ date, checkIn }) => {
        if (!checkIn) return null
        const top = y(checkIn.score)
        return (
          <rect
            key={date.getDate()}
            x={x(date.getDate()) + 1}
            y={top}
            width={Math.max(2, slot - 2)}
            height={y(0) - top}
            rx="3"
            className={moodFill[checkIn.mood]}
            opacity="0.85"
          />
        )
      })}

      {days.map(({ date, checkIn, future }) => (
        <rect
          key={`hit-${date.getDate()}`}
          x={x(date.getDate())}
          y={TOP}
          width={slot}
          height={y(0) - TOP}
          fill="transparent"
          tabIndex={future ? -1 : 0}
          role="button"
          aria-label={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}: ${checkIn ? moodLabel(checkIn.mood) : future ? 'upcoming' : 'no check-in'}`}
          className="cursor-pointer outline-none hover:fill-ink/5 focus-visible:fill-teal/10"
          {...bind(dayTip(date, checkIn, future))}
        />
      ))}

      {weeks.map((week, i) => {
        const avg = weekAverage(week)
        const inMonth = week.filter((c) => c && !c.future)
        if (!avg || !inMonth.length) return null
        const x1 = x(inMonth[0].date.getDate()) + 2
        const x2 = x(inMonth.at(-1).date.getDate()) + slot - 2
        return (
          <g key={i}>
            <line x1={x1} x2={x2} y1={y(avg)} y2={y(avg)} strokeWidth="2" strokeLinecap="round" className="stroke-ink" />
            <circle cx={x2} cy={y(avg)} r="4" strokeWidth="2" className="fill-ink stroke-surface" />
            <circle
              cx={x2}
              cy={y(avg)}
              r="11"
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`Week ${i + 1} average ${avg.toFixed(1)}`}
              className="cursor-pointer outline-none focus-visible:stroke-teal focus-visible:[stroke-width:2]"
              {...bind(weekTip(i, week.filter(Boolean), avg, week.filter((c) => c?.checkIn).length))}
            />
          </g>
        )
      })}

      {ticks.map((d) => (
        <text key={d} x={x(d) + slot / 2} y={H - 6} fontSize={FONT} textAnchor="middle" className="fill-muted">
          {d}
        </text>
      ))}
    </svg>
    {tooltip}
    </div>
  )
}
