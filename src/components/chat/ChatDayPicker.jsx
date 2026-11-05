import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { dayName } from '../../data/sampleChats'
import { moodLabel } from '../../lib/moodMonth'
import StressFace from '../ui/StressFace'

function StressDot({ mood }) {
  const label = mood ? `Stress: ${moodLabel(mood)}` : 'No check-in'
  return (
    <span title={label} className="inline-flex">
      <StressFace mood={mood} size={20} />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export default function ChatDayPicker({ days, value, onChange, stressOf = () => null }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  const current = days.find((d) => d.key === value) ?? days[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e) => !wrap.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (key) => {
    onChange(key)
    setOpen(false)
  }

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-3.5 text-sm text-ink hover:border-teal"
      >
        {dayName(current.date)}
        <span className="h-4 w-px bg-line" aria-hidden="true" />
        <StressDot mood={stressOf(current.date)} />
        <ChevronDown size={15} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 top-full z-20 mt-2 max-h-[320px] w-[200px] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          {days.map((d) => {
            const selected = d.key === current.key
            return (
              <button
                key={d.key}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => pick(d.key)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink ${
                  selected ? 'bg-teal-soft font-semibold' : 'hover:bg-cream'
                }`}
              >
                <span className="flex-1 whitespace-nowrap">{dayName(d.date)}</span>
                <StressDot mood={stressOf(d.date)} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
