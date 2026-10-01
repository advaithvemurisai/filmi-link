import { useCallback, useEffect, useState } from 'react'
import Game from './components/Game'
import Landing from './components/Landing'
import { Icon, PlayerBadge, type IconName } from './components/Bits'
import { Archive, HomePicker, HowTo, Stats } from './components/Modals'
import { AccountSheet, FriendsSheet } from './components/Social'
import { buildIndex, isValidChain, randomPuzzle, type GraphData, type Index } from './lib/graph'
import { localDateKey, puzzleFor, puzzleNumber, type PuzzleDef, type PuzzleFile } from './lib/daily'
import { langName } from './lib/format'
import {
  computeStats, hasPlayed, loadProgress, loadResults, loadSettings, saveProgress, saveResults, saveSettings,
  type Result, type Track,
} from './lib/storage'
import { fetchRouteShare, loadAccount, saveAccount, sync, SyncError, type Account } from './lib/account'

type Mode = { kind: 'daily'; date: string; track: Track } | { kind: 'free'; puzzle: PuzzleDef; n: number }
type Sheet = 'how' | 'stats' | 'archive' | 'account' | 'friends' | 'home' | null

const BASE = import.meta.env.BASE_URL
type Route = 'landing' | 'play'
const routeFromPath = (): Route => (location.pathname.slice(BASE.length).startsWith('play') ? 'play' : 'landing')

/** Returning players land straight in the game; the landing page is for first visits and shared links. */
function initialRoute(): Route {
  const r = routeFromPath()
  if (r === 'landing' && hasPlayed()) {
    history.replaceState(null, '', `${BASE}play`)
    return 'play'
  }
  return r
}

/** Drop results saved against an older dataset or schedule (ids/puzzles no longer match). */
function validResults(idx: Index, file: PuzzleFile, results: Record<string, Result>) {
  const valid: Record<string, Result> = {}
  for (const [d, r] of Object.entries(results)) {
    const pz = puzzleFor(file, d)
    if (pz && r.par === pz.par && isValidChain(idx, r.path, pz.s, r.gaveUp ? undefined : pz.e)) valid[d] = r
  }
  return valid
}

function validProgress(idx: Index, date: string, start: string, track: Track) {
  const p = loadProgress(date, track)
  return p && isValidChain(idx, p.path, start) ? p : null
}

const fetchJSON = <T,>(path: string) =>
  fetch(`${BASE}data/${path}`).then((r) => {
    if (!r.ok) throw new Error(path)
    return r.json() as Promise<T>
  })

export default function App() {
  const [idx, setIdx] = useState<Index | null>(null)
  const [file, setFile] = useState<PuzzleFile | null>(null)
  const [homeFile, setHomeFile] = useState<PuzzleFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [today] = useState(localDateKey)
  const [mode, setMode] = useState<Mode>({ kind: 'daily', date: today, track: 'all' })
  const [sheet, setSheet] = useState<Sheet>(null)
  const [results, setResults] = useState<Record<string, Result>>(() => loadResults())
  const [settings, setSettings] = useState(loadSettings)
  const [homeResults, setHomeResults] = useState<Record<string, Result>>(() => (settings.home ? loadResults(settings.home) : {}))
  const [route, setRoute] = useState<Route>(initialRoute)
  const [account, setAccount] = useState<Account | null>(loadAccount)
  const [welcome, setWelcome] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState(0)
  const [routeShare, setRouteShare] = useState<{ count: number; total: number } | null>(null)

  useEffect(() => {
    const onPop = () => setRoute(routeFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: Route) => {
    history.pushState(null, '', to === 'play' ? `${BASE}play` : BASE)
    setRoute(to)
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    Promise.all([fetchJSON<GraphData>('graph.json'), fetchJSON<PuzzleFile>('puzzles.json')])
      .then(([g, p]) => {
        const index = buildIndex(g)
        setIdx(index)
        setFile(p)
        setResults(validResults(index, p, loadResults()))
      })
      .catch(() => setError('Could not load film data.'))
  }, [])

  // The home-industry schedule loads only for players who picked one.
  useEffect(() => {
    setHomeFile(null)
    if (!settings.home || !idx) return
    const home = settings.home
    fetchJSON<PuzzleFile>(`puzzles-${home}.json`)
      .then((p) => {
        setHomeFile(p)
        setHomeResults(validResults(idx, p, loadResults(home)))
      })
      .catch(() => setHomeFile(null))
  }, [settings.home, idx])

  /** Push local results up and adopt the merged set (server keeps the first result per day). */
  const pushResults = useCallback(
    (local: Record<string, Result>) => {
      if (!account || !idx || !file) return
      sync(account, local)
        .then((r) => {
          const merged = validResults(idx, file, { ...local, ...r.results })
          saveResults(merged)
          setResults(merged)
          setSyncedAt(Date.now())
        })
        .catch((e) => {
          if (e instanceof SyncError && e.status === 401) {
            saveAccount(null)
            setAccount(null)
          }
        })
    },
    [account, idx, file],
  )

  // Sync once the data is in, so another device's results show up here.
  useEffect(() => {
    if (idx && file && account) pushResults(validResults(idx, file, loadResults()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, file, account?.token])

  // Once today's India result is on the server, ask how many players took the same route.
  const todays = results[today]
  useEffect(() => {
    if (!account || !syncedAt || !todays || todays.gaveUp) return
    fetchRouteShare(account, today).then(setRouteShare).catch(() => setRouteShare(null))
  }, [account, syncedAt, todays, today])

  // First time someone reaches the game, run the guided example.
  useEffect(() => {
    if (route !== 'play' || !idx) return
    try {
      if (!localStorage.getItem('fl:seen')) {
        setSheet('how')
        localStorage.setItem('fl:seen', '1')
      }
    } catch { /* ignore */ }
  }, [route, idx])

  const playRandom = useCallback(
    (par: number) => {
      if (!idx) return
      const p = randomPuzzle(idx, par)
      if (p) setMode((m) => ({ kind: 'free', puzzle: p, n: m.kind === 'free' ? m.n + 1 : 1 }))
      setSheet(null)
    },
    [idx],
  )

  const updateSettings = (next: typeof settings) => {
    setSettings(next)
    saveSettings(next)
  }

  const streak = computeStats(results, today).streak

  if (route === 'landing') {
    return (
      <Landing
        idx={idx}
        file={file}
        today={today}
        onPlayDaily={() => { setMode({ kind: 'daily', date: today, track: 'all' }); navigate('play') }}
        onPlayRandom={() => { playRandom(3); navigate('play') }}
      />
    )
  }
  if (error) return <div className="splash">{error}</div>
  if (!idx || !file) return <div className="splash"><span className="reel" /> Loading reels…</div>

  const home = settings.home
  const track: Track = mode.kind === 'daily' && mode.track !== 'all' && homeFile ? mode.track : 'all'
  const activeFile = track === 'all' ? file : homeFile!
  const activeResults = track === 'all' ? results : homeResults
  const trackName = track === 'all' ? 'India' : langName(track)

  const dailyNo = mode.kind === 'daily' ? puzzleNumber(activeFile, mode.date) : null
  const puzzle = mode.kind === 'daily' ? puzzleFor(activeFile, mode.date) : mode.puzzle
  const label =
    mode.kind === 'free'
      ? 'Free play'
      : `${trackName} #${dailyNo}${mode.date === today ? ' · Today' : ''}`
  const shareTitle = mode.kind === 'free'
    ? 'CinematicLink · free play'
    : `CinematicLink ${track === 'all' ? '' : `${trackName} `}#${dailyNo}${settings.hard ? ' (hard)' : ''}`

  const saveTrackResults = (next: Record<string, Result>) => {
    saveResults(next, track)
    if (track === 'all') {
      setResults(next)
      pushResults(next)
    } else setHomeResults(next)
  }

  const isDaily = (t: Track) => mode.kind === 'daily' && mode.date === today && track === t
  const openDaily = (t: Track) => setMode({ kind: 'daily', date: today, track: t })

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => navigate('landing')} title="Home">
          <span className="reel" aria-hidden />
          <span>Cinematic<em>Link</em></span>
        </button>
        <nav>
          <NavBtn icon="dice" label="Random" on={mode.kind === 'free'} onClick={() => playRandom(3)} />
          <NavBtn icon="archive" label="Archive" onClick={() => setSheet('archive')} />
          <NavBtn icon="stats" label="Stats" onClick={() => setSheet('stats')} />
          <NavBtn icon="trophy" label="Friends" onClick={() => setSheet('friends')} />
          <button className="icon-btn" onClick={() => setSheet('how')} aria-label="How to play"><Icon name="help" size={17} /></button>
          <label className={`switch ${settings.hard ? 'on' : ''}`} title="Hard mode: no hints, no signal bars">
            <input type="checkbox" checked={settings.hard} onChange={() => updateSettings({ ...settings, hard: !settings.hard })} />
            <span className="switch-track" aria-hidden><i /></span>
            <span>Hard</span>
          </label>
        </nav>
        <button className={`player-pill ${account ? '' : 'is-anon'}`} onClick={() => setSheet('account')}
          title={account ? `Signed in as ${account.name}` : 'Save your streak'}>
          <Icon name="flame" size={16} className={`pill-flame ${streak ? '' : 'is-cold'}`} />
          <b>{streak}</b>
          {account ? <PlayerBadge name={account.name} size="sm" /> : <span className="pill-cta">Save</span>}
        </button>
      </header>

      <div className="tracks" role="tablist" aria-label="Daily puzzles">
        <button role="tab" aria-selected={isDaily('all')} className={isDaily('all') ? 'on' : ''} onClick={() => openDaily('all')}>
          <Icon name="globe" size={15} /> India daily
        </button>
        {home && homeFile ? (
          <button role="tab" aria-selected={isDaily(home)} className={isDaily(home) ? 'on' : ''} onClick={() => openDaily(home)}>
            <Icon name="home" size={15} /> {langName(home)} daily
          </button>
        ) : (
          <button className="track-add" onClick={() => setSheet('home')}><Icon name="plus" size={15} /> Home cinema</button>
        )}
        {home && homeFile && (
          <button className="track-edit" onClick={() => setSheet('home')} aria-label="Change home cinema">Change</button>
        )}
      </div>

      {welcome && <div className="toast" role="status" onAnimationEnd={() => setWelcome(null)}>{welcome}</div>}

      {mode.kind === 'free' && (
        <div className="free-bar">
          <span>Random chain</span>
          <button onClick={() => playRandom(2)}><i className="lvl" data-l="1" /> Easy</button>
          <button onClick={() => playRandom(3)}><i className="lvl" data-l="2" /> Medium</button>
          <button onClick={() => playRandom(4)}><i className="lvl" data-l="3" /> Hard</button>
        </div>
      )}

      {puzzle ? (
        <Game
          key={mode.kind === 'daily' ? `${track}${mode.date}` : `free${mode.n}`}
          idx={idx}
          puzzle={puzzle}
          label={label}
          hard={settings.hard}
          shareTitle={shareTitle}
          isToday={mode.kind === 'daily' && mode.date === today}
          routeShare={mode.kind === 'daily' && mode.date === today && track === 'all' ? routeShare : null}
          initialResult={mode.kind === 'daily' ? activeResults[mode.date] ?? null : null}
          initialProgress={mode.kind === 'daily' ? validProgress(idx, mode.date, puzzle.s, track) : null}
          onProgress={(p) => mode.kind === 'daily' && saveProgress(mode.date, p, track)}
          onFinish={(r) => {
            if (mode.kind !== 'daily') return
            saveTrackResults({ ...activeResults, [mode.date]: { ...r, live: mode.date === today } })
          }}
          onNewRandom={playRandom}
          onOpenArchive={() => setSheet('archive')}
          player={account?.name ?? null}
          onSaveStreak={() => setSheet('account')}
          onOpenFriends={() => setSheet('friends')}
        />
      ) : (
        <div className="splash">The first daily puzzle hasn't dropped yet.</div>
      )}

      <footer className="footer">
        {idx.data.meta.source === 'tmdb' ? (
          <>Film data from <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDb</a>. This product uses the TMDb API but is not endorsed or certified by TMDb.</>
        ) : (
          <>Starter dataset: {idx.data.meta.films} hand-picked films across {new Set(Object.values(idx.data.films).map((f) => f.l)).size} languages.</>
        )}
      </footer>

      {sheet === 'how' && <HowTo idx={idx} onClose={() => setSheet(null)} />}
      {sheet === 'stats' && (
        <Stats
          idx={idx} today={today} synced={!!account} onClose={() => setSheet(null)}
          sets={[{ label: 'India', results }, ...(home && homeFile ? [{ label: langName(home), results: homeResults }] : [])]}
        />
      )}
      {sheet === 'home' && (
        <HomePicker
          home={home} onClose={() => setSheet(null)}
          onPick={(l) => {
            updateSettings({ ...settings, home: l })
            setHomeResults(l ? loadResults(l) : {})
            setMode({ kind: 'daily', date: today, track: l ?? 'all' })
            setSheet(null)
          }}
        />
      )}
      {sheet === 'account' && (
        <AccountSheet
          account={account} results={results} streak={streak} onClose={() => setSheet(null)}
          onSignedIn={(a, merged, created) => {
            saveAccount(a)
            setAccount(a)
            const all = validResults(idx, file, { ...results, ...merged })
            saveResults(all)
            setResults(all)
            setSheet(null)
            setWelcome(created ? `Welcome, ${a.name}. Your streak is saved.` : `Welcome back, ${a.name}`)
          }}
          onSignOut={() => { saveAccount(null); setAccount(null); setRouteShare(null); setSheet(null) }}
        />
      )}
      {sheet === 'friends' && (
        <FriendsSheet account={account} today={today} onClose={() => setSheet(null)} onSignIn={() => setSheet('account')} />
      )}
      {sheet === 'archive' && (
        <Archive idx={idx} file={activeFile} today={today} results={activeResults} onClose={() => setSheet(null)}
          onPick={(d) => { setMode({ kind: 'daily', date: d, track }); setSheet(null) }} />
      )}
    </div>
  )
}

function NavBtn({ icon, label, on, onClick }: { icon: IconName; label: string; on?: boolean; onClick: () => void }) {
  return (
    <button className={`nav-btn ${on ? 'on' : ''}`} onClick={onClick} title={label}>
      <Icon name={icon} size={17} />
      <span className="nav-label">{label}</span>
    </button>
  )
}
