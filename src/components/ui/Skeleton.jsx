import { LoaderCircle } from 'lucide-react'

const WIDTHS = [
  ['w-3/5', 'w-1/3'],
  ['w-2/5', 'w-1/4'],
  ['w-4/5', 'w-2/5'],
  ['w-1/2', 'w-1/4'],
  ['w-1/3', 'w-1/5'],
  ['w-3/4', 'w-1/3'],
]

export default function Skeleton({ className = '', style }) {
  return <span aria-hidden="true" style={style} className={`skeleton block ${className}`} />
}

export function Spinner({ size = 16 }) {
  return <LoaderCircle size={size} aria-hidden="true" className="shrink-0 motion-safe:animate-spin" />
}

export function SkeletonLines({ title = 'w-3/5', sub = 'w-1/3' }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-2">
      <Skeleton className={`h-3 rounded ${title}`} />
      <Skeleton className={`h-2.5 rounded ${sub}`} />
    </span>
  )
}

export function SkeletonSongRow({ index = 0, size = 40 }) {
  const [title, sub] = WIDTHS[index % WIDTHS.length]
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="shrink-0 rounded-lg" style={{ width: size, height: size }} />
      <SkeletonLines title={title} sub={sub} />
    </div>
  )
}

export function SkeletonPlaylistRow({ index = 0, columns }) {
  const [title, sub] = WIDTHS[index % WIDTHS.length]
  return (
    <div aria-hidden="true" className={`${columns} rounded-[14px] border border-line bg-surface px-3.5 py-2.5`}>
      <Skeleton className="h-2.5 w-3 rounded" />
      <span className="flex min-w-0 items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <SkeletonLines title={title} sub={sub} />
      </span>
      <Skeleton className="hidden h-2.5 w-1/2 rounded lg:block" />
      <Skeleton className="hidden h-2.5 w-3/5 rounded xl:block" />
      <Skeleton className="h-2.5 w-8 rounded" />
      <span />
      <span />
    </div>
  )
}

export function SkeletonTile({ className = 'aspect-square rounded-[12px]' }) {
  return (
    <div aria-hidden="true">
      <Skeleton className={className} />
      <Skeleton className="mt-2.5 h-3 w-3/4 rounded" />
      <Skeleton className="mt-2 h-2.5 w-1/3 rounded" />
    </div>
  )
}

