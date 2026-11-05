import { useCallback, useEffect, useMemo, useState } from 'react'
import Sidebar, { MobileHeader } from './components/layout/Sidebar'
import MiniPlayer from './components/player/MiniPlayer'
import SettingsModal from './components/settings/SettingsModal'
import { ThemeProvider } from './theme'
import { RatingsProvider } from './ratings'
import CallbackPage from './pages/CallbackPage'
import ChatPage from './pages/ChatPage'
import HomePage from './pages/HomePage'
import MoodPage from './pages/MoodPage'
import PlaylistsPage from './pages/PlaylistsPage'
import { SpotifyProvider, useSpotify } from './spotify/useSpotify'
import CallBadge from './components/dev/CallBadge'
import { PlayerProvider, usePlayer } from './spotify/usePlayer'
import { FeedbackProvider } from './feedback'
import { AccountProvider, useAccount } from './account'
import { AppearanceProvider } from './appearance'
import { cloudPush } from './lib/cloudSync'
import { useDevMode } from './lib/devMode'
import AuthPage from './pages/AuthPage'
import OnboardingPage from './pages/OnboardingPage'

const SAVED_KEY = 'moodbot:saved-songs'

const loadSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY)) ?? []
  } catch {
    return []
  }
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname)
  const finishLogin = useCallback(() => setPath(import.meta.env.BASE_URL), [])

  if (path === `${import.meta.env.BASE_URL}callback`) return <CallbackPage onDone={finishLogin} />

  return (
    <ThemeProvider>
      {import.meta.env.DEV && <CallBadge />}
      <AccountProvider>
        <AppearanceProvider>
          <SpotifyProvider>
            <PlayerProvider>
              <FeedbackProvider>
                <RatingsProvider>
                  <Gate />
                </RatingsProvider>
              </FeedbackProvider>
            </PlayerProvider>
          </SpotifyProvider>
        </AppearanceProvider>
      </AccountProvider>
    </ThemeProvider>
  )
}

function Gate() {
  const { ready, user, guest, onboarded, replay } = useAccount()
  if (!ready) return <div className="min-h-screen bg-cream" />
  if (!user && !guest && onboarded) return <AuthPage />
  if (!onboarded || replay) return <OnboardingPage />
  return <Muse />
}

function Muse() {
  const { status, liked, disconnect, likeSong, unlikeSong } = useSpotify()
  const { signOut } = useAccount()
  const { visible: playerVisible } = usePlayer()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const dev = useDevMode()
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const logOut = () => {
    disconnect()
    setSettingsOpen(false)
    setPage('home')
    signOut()
  }
  const [page, setPage] = useState('home')
  const [openPlaylistId, setOpenPlaylistId] = useState(null)
  const navigate = (next) => {
    setOpenPlaylistId(null)
    setPage(next)
  }
  const openPlaylist = (id) => {
    setOpenPlaylistId(id)
    setPage('playlists')
  }
  const [chatSaved, setChatSaved] = useState(loadSaved)

  useEffect(() => {
    localStorage.setItem(SAVED_KEY, JSON.stringify(chatSaved))
    cloudPush('saved', chatSaved)
  }, [chatSaved])

  const likedIds = useMemo(() => new Set(liked.map((s) => s.id)), [liked])
  const savedSongs = useMemo(
    () => [...chatSaved, ...liked.filter((s) => !chatSaved.some((c) => c.id === s.id))],
    [chatSaved, liked]
  )

  const isSaved = (id) => likedIds.has(id) || chatSaved.some((s) => s.id === id)

  const toggleSave = (song) => {
    const saved = isSaved(song.id)
    setChatSaved((prev) =>
      saved ? prev.filter((s) => s.id !== song.id) : [{ ...song, source: 'chat', isNew: undefined }, ...prev]
    )
    if (status === 'connected' && /^[A-Za-z0-9]{22}$/.test(song.id ?? '')) {
      if (saved) unlikeSong(song)
      else likeSong(song)
    }
  }

  const shared = { savedSongs, isSaved, onSave: toggleSave }
  const pages = {
    home: <HomePage {...shared} onNavigate={navigate} onOpenLiked={() => openPlaylist('liked')} />,
    chat: <ChatPage {...shared} onNavigate={navigate} onOpenPlaylist={openPlaylist} onOpenLiked={() => openPlaylist('liked')} />,
    mood: <MoodPage savedSongs={savedSongs} />,
    playlists: <PlaylistsPage {...shared} initialOpenId={openPlaylistId} />,
  }

  return (
    <div className="flex h-dvh bg-cream">
      <Sidebar page={page} onNavigate={navigate} onOpenSettings={() => setSettingsOpen(true)} />
      <main
        className={`relative flex min-w-0 flex-1 flex-col md:pb-0 ${
          playerVisible ? 'pb-[calc(8rem+env(safe-area-inset-bottom))]' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]'
        }`}
      >
        <MobileHeader onOpenSettings={() => setSettingsOpen(true)} />
        <div className="min-h-0 flex-1 overflow-y-auto pt-16 md:pt-0">
          <div key={`${dev.on}-${dev.sample}`} className="mx-auto h-full max-w-[1680px]">
            {pages[page]}
          </div>
        </div>
        <MiniPlayer />
      </main>
      {settingsOpen && <SettingsModal onClose={closeSettings} onLogOut={logOut} />}
    </div>
  )
}
