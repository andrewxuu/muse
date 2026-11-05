import { useState } from 'react'
import { Check, Heart, Music, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useSpotify } from '../spotify/useSpotify'
import PlaylistDetail from './PlaylistDetail'
import NewPlaylistForm from '../components/playlists/NewPlaylistForm'
import ConfirmDelete from '../components/playlists/ConfirmDelete'
import UndoBar from '../components/ui/UndoBar'
import { SkeletonTile, Spinner } from '../components/ui/Skeleton'

export default function PlaylistsPage({ savedSongs, isSaved, onSave, initialOpenId = null }) {
  const { status, error, likedLoad, profile, playlists, sync, connect, createPlaylist, removePlaylists, restorePlaylists } = useSpotify()
  const [openId, setOpenId] = useState(initialOpenId)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState([])
  const [confirming, setConfirming] = useState(false)
  const [undo, setUndo] = useState(null)
  const isMine = (p) => Boolean(profile?.id) && p.ownerId === profile.id
  const pickedLists = playlists.filter((p) => picked.includes(p.id))

  const toggleEdit = () => {
    setEditing((on) => !on)
    setPicked([])
  }

  const togglePick = (id) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const confirmDelete = async () => {
    const order = playlists.map((p) => p.id)
    const { done, failed } = await removePlaylists(pickedLists)
    setConfirming(false)
    setEditing(false)
    setPicked([])
    setUndo({ lists: done, order, failed })
  }

  const undoDelete = async () => {
    const { lists, order } = undo
    setUndo(null)
    await restorePlaylists(lists, order).catch(() => {})
  }
  const likedPlaylist = { id: 'liked', name: 'Liked songs', count: savedSongs.length, liked: true }
  const selected = openId === 'liked' ? likedPlaylist : playlists.find((p) => p.id === openId)
  const syncing = status === 'syncing'
  const needsSpotify = status === 'disconnected' || status === 'expired'

  const emptyNote = () => {
    if (syncing) return <p role="status" className="sr-only">Loading your playlists</p>
    if (needsSpotify) return <p className="text-[15px] text-muted">Connect Spotify to see your playlists here.</p>
    return <p className="text-[15px] text-muted">Your Spotify account doesn’t have any other playlists yet.</p>
  }

  const body = () => (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(200px,260px))] sm:gap-6">
        <button
          type="button"
          disabled={editing}
          onClick={() => setOpenId('liked')}
          className={`block text-left ${editing ? 'opacity-50' : ''}`}
        >
          <div className="flex aspect-square items-center justify-center rounded-[14px] bg-teal text-white sm:aspect-auto sm:h-[220px]">
            <Heart size={56} fill="currentColor" />
          </div>
          <p className="mt-2 truncate text-base font-semibold">Liked songs</p>
          {likedLoad ? (
            <p role="status" className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
              <Spinner size={13} />
              {likedLoad.total ? `Loading ${likedLoad.have} of ${likedLoad.total}` : 'Loading…'}
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-muted">{savedSongs.length} songs</p>
          )}
        </button>
        {playlists.map((p) => {
          const mine = isMine(p)
          const on = picked.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              disabled={editing && !mine}
              aria-pressed={editing ? on : undefined}
              onClick={() => (editing ? togglePick(p.id) : setOpenId(p.id))}
              className={`block text-left ${editing && !mine ? 'opacity-50' : ''}`}
            >
              <div className={`relative rounded-[14px] ${on ? 'ring-2 ring-teal ring-offset-2 ring-offset-cream' : ''}`}>
                {p.image ? (
                  <img src={p.image} alt="" className="aspect-square w-full rounded-[14px] object-cover sm:h-[220px] sm:aspect-auto" />
                ) : (
                  <div className="aspect-square rounded-[14px] bg-art sm:aspect-auto sm:h-[220px]" />
                )}
                {editing && mine && (
                  <span
                    className={`absolute left-2.5 top-2.5 flex size-6 items-center justify-center rounded-full border-[1.5px] ${
                      on ? 'border-teal bg-teal text-white' : 'border-line bg-surface'
                    }`}
                  >
                    {on && <Check size={14} />}
                  </span>
                )}
              </div>
              <p className="mt-2 truncate text-base font-semibold">{p.name}</p>
              {p.count !== null && <p className="mt-2 text-[13px] text-muted">{p.count} songs</p>}
            </button>
          )
        })}
        {syncing &&
          !playlists.length &&
          Array.from({ length: 5 }, (_, i) => <SkeletonTile key={i} className="aspect-square rounded-[14px] sm:aspect-auto sm:h-[220px]" />)}
      </div>
      {!playlists.length && emptyNote()}
    </div>
  )

  if (selected) {
    return (
      <PlaylistDetail
        playlist={selected}
        songs={selected.liked ? savedSongs : undefined}
        onBack={() => setOpenId(null)}
        isSaved={isSaved}
        onSave={onSave}
      />
    )
  }

  return (
    <section className="flex flex-col gap-6 px-4 py-5 md:px-8 md:py-8 xl:px-10">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-[30px] font-semibold">Playlists</h1>
        <div className="flex flex-wrap justify-end gap-3">
          {playlists.some(isMine) && (
            <button
              type="button"
              onClick={toggleEdit}
              className="flex h-11 items-center rounded-full border border-line bg-surface px-[18px] text-[15px] font-semibold hover:border-teal"
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
          <button
            type="button"
            onClick={needsSpotify ? connect : sync}
            aria-label={needsSpotify ? 'Connect Spotify' : 'Sync to Spotify'}
            className="flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[15px] hover:border-teal md:px-[18px]"
          >
            <Music size={18} className="hidden text-teal md:block" />
            <RefreshCw size={18} className={`text-teal md:hidden ${syncing ? 'animate-spin' : ''}`} />
            <span className={needsSpotify || syncing ? '' : 'hidden md:inline'}>
              {syncing ? 'Syncing…' : needsSpotify ? 'Connect Spotify' : 'Sync to Spotify'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => (needsSpotify ? connect() : setCreating(true))}
            className="hidden h-11 items-center gap-1.5 rounded-full bg-teal px-[18px] text-[15px] text-white md:flex"
          >
            <Plus size={18} />
            New playlist
          </button>
        </div>
      </div>

      {editing && (
        <div className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-4 py-2.5">
          <p className="text-[15px] text-muted">
            {picked.length ? `${picked.length} selected` : 'Pick playlists to delete'}
          </p>
          <button
            type="button"
            disabled={!picked.length}
            onClick={() => setConfirming(true)}
            className="flex h-10 items-center gap-1.5 rounded-full bg-danger px-4 text-[15px] font-semibold text-white disabled:opacity-40"
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      )}

      {error && status === 'error' && <p className="text-[13px] text-muted">{error}</p>}
      {body()}

      {!editing && (
        <button
          type="button"
          aria-label="New playlist"
          onClick={() => (needsSpotify ? connect() : setCreating(true))}
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-full bg-teal text-white shadow-lg md:hidden"
        >
          <Plus size={26} />
        </button>
      )}

      {confirming && <ConfirmDelete playlists={pickedLists} onConfirm={confirmDelete} onCancel={() => setConfirming(false)} />}
      {undo && undo.lists.length > 0 && (
        <UndoBar
          message={undo.lists.length === 1 ? `Deleted ${undo.lists[0].name}` : `Deleted ${undo.lists.length} playlists`}
          onUndo={undoDelete}
          onDismiss={() => setUndo(null)}
        />
      )}

      {creating && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={(e) => e.target === e.currentTarget && setCreating(false)}
        >
          <div role="dialog" aria-label="New playlist" className="w-full max-w-[380px] rounded-[14px] border border-line bg-surface p-6">
            <h2 className="mb-4 font-serif text-[22px] font-semibold">New playlist</h2>
            <NewPlaylistForm
              onCancel={() => setCreating(false)}
              onCreate={async (name) => {
                const playlist = await createPlaylist(name)
                setCreating(false)
                setOpenId(playlist.id)
              }}
            />
          </div>
        </div>
      )}
    </section>
  )
}
