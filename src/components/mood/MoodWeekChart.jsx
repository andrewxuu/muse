import { dayTip, useChartTooltip } from '../ui/ChartTooltip'
import { moodBg, moodLabel } from '../../lib/moodMonth'

export default function MoodWeekChart({ days }) {
  const { ref, bind, tooltip } = useChartTooltip()

  return (
    <div ref={ref} className="relative flex flex-col gap-3">
      <div className="flex h-[220px] items-end gap-2.5">
        {days.map(({ date, checkIn }) => {
          const name = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
          return (
            <button
              key={date.toISOString()}
              type="button"
              aria-label={checkIn ? `${name}: ${moodLabel(checkIn.mood)}` : `${name}: no check-in`}
              {...bind(dayTip(date, checkIn))}
              className="flex h-full flex-1 items-end rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            >
              {checkIn ? (
                <span style={{ height: checkIn.score * 44 }} className={`w-full rounded-b-[2px] rounded-t-md ${moodBg[checkIn.mood]}`} />
              ) : (
                <span className="flex h-[44px] w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-line px-0.5 text-center text-[11px] leading-tight text-hint">
                  <span aria-hidden="true" className="sm:hidden">–</span>
                  <span aria-hidden="true" className="hidden sm:inline">No check-in</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2.5 text-center text-xs text-muted">
        {days.map(({ date }) => (
          <p key={date.toISOString()} className="flex-1">
            {date.toLocaleDateString('en-US', { weekday: 'short' })}
          </p>
        ))}
      </div>
      {tooltip}
    </div>
  )
}
