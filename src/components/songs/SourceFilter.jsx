import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Funnel } from 'lucide-react'

const MENU_WIDTH = 200
const EDGE = 8
const ROW_HEIGHT = 40
const BOTTOM_GAP = 96

export default function SourceFilter({ options, value, onChange, icon: Icon = Funnel }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState({ left: false, up: false })
  const wrap = useRef(null)

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

  const toggle = () => {
    if (!open && wrap.current) {
      const box = wrap.current.getBoundingClientRect()
      const height = options.length * ROW_HEIGHT + 16
      setPlace({
        left: box.right - MENU_WIDTH < EDGE,
        up: box.bottom + height > window.innerHeight - BOTTOM_GAP && box.top > height,
      })
    }
    setOpen((o) => !o)
  }

  const pick = (id) => {
    onChange(id)
    setOpen(false)
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="flex h-12 items-center gap-1.5 rounded-[14px] border border-teal bg-teal-soft px-3.5 text-sm font-semibold text-teal"
      >
        <Icon size={15} aria-hidden="true" />
        {value}
        <ChevronDown size={15} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-30 w-[200px] max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-1.5 shadow-lg ${
            place.left ? 'left-0' : 'right-0'
          } ${place.up ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          {options.map((o) => {
            const selected = value === o.id
            return (
              <button
                key={o.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => pick(o.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
                  selected ? 'bg-teal-soft font-semibold' : 'hover:bg-cream'
                } ${o.count === 0 ? 'text-hint' : 'text-ink'}`}
              >
                <span className="flex-1">{o.id}</span>
                {o.count !== undefined && <span className="tabular-nums text-muted">{o.count}</span>}
                <Check size={15} aria-hidden="true" className={selected ? 'text-teal' : 'invisible'} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
