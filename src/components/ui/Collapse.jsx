export default function Collapse({ open, className = '', children }) {
  return (
    <div
      inert={!open}
      className={`grid w-full transition-[grid-template-rows,opacity] duration-[450ms] ease-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      } ${className}`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
