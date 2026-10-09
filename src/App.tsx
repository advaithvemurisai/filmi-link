import { useCallback, useEffect, useState } from 'react'
import Game from './components/Game'
import Landing from './components/Landing'
import { Icon, PlayerBadge, type IconName } from './components/Bits'
import { Archive, HomePicker, HowTo, Stats } from './components/Modals'
import { AccountSheet, FriendsSheet } from './components/Social'
import { buildIndex, isValidChain, linkCount, randomPuzzle, type GraphData, type Index, type Node } from './lib/graph'
import { addDays, localDateKey, puzzleFor, puzzleNumber, type PuzzleDef, type PuzzleFile } from './lib/daily'
import { langName } from './lib/format'
import {
  computeStats, hasPlayed, loadProgress, loadRecentFilms, loadResults, loadSettings, rememberFilms, saveProgress, saveResults,
  saveSettings,
  type Result, type Track,
} from './lib/storage'
import { reportPlayed } from './lib/push'
import { fetchRouteShare, loadAccount, saveAccount, sync, SyncError, type Account } from './lib/account'
import { freeFromLink, parseFreeLink, validChallenge, validResults, type Friend } from './lib/results'

type Mode = { kind: 'daily'; date: string; track: Track } | { kind: 'free'; puzzle: PuzzleDef; n: number; friend?: Friend }
type Sheet = 'how' | 'stats' | 'archive' | 'account' | 'friends' | 'home' | null

const BASE = import.meta.env.BASE_URL
type Route = 'landing' | 'play'
const routeFromPath = (): Route => (location.pathname.slice(BASE.length).startsWith('play') ? 'play' : 'landing')

/**
 * A friend's share link carries their score and the people/films between the endpoints:
 * `?c=<puzzle no>-<links>.<id>.<id>…`. The ids are optional (older links have none).
 */
export interface Challenge { no: number; links: number; mids: string[] }
function parseChallenge(): Challenge | null {
  const m = /^(\d{1,5})-(\d{1,2})((?:\.\d{1,9}){0,23})$/.exec(new URLSearchParams(location.search).get('c') ?? '')
  return m ? { no: Number(m[1]), links: Number(m[2]), mids: m[3] ? m[3].slice(1).split('.') : [] } : null
}
// Read once at load, before the returning-player redirect rewrites the URL.
const CHALLENGE = parseChallenge()

const FREE_LINK = parseFreeLink(location.search)

const flag = (k: string, v?: boolean) => {
  try {
    if (v === undefined) return !!localStorage.getItem(k)
    if (v) localStorage.setItem(k, '1')
    else localStorage.removeItem(k)
  } catch { /* storage unavailable */ }
  return false
}

/** Returning players land straight in the game; the landing page is for first visits and shared links. */
function initialRoute(): Route {
  const r = routeFromPath()
  // A shared random chain skips the landing page, which is about today's daily.
  if (r === 'landing' && (hasPlayed() || FREE_LINK)) {
    history.replaceState(null, '', `${BASE}play${location.search}`)
    return 'play'
  }
  return r
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
  const [homeFailed, setHomeFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [today, setToday] = useState(localDateKey)
  /** The day that just ended while this tab was open, so the game can offer the new puzzle. */
  const [rolledFrom, setRolledFrom] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'daily', date: today, track: 'all' })
  const [sheet, setSheet] = useState<Sheet>(null)
  const [results, setResults] = useState<Record<string, Result>>(() => loadResults())
  const [settings, setSettings] = useState(loadSettings)
  const [homeResults, setHomeResults] = useState<Record<string, Result>>(() => (settings.home ? loadResults(settings.home) : {}))
  const [route, setRoute] = useState<Route>(initialRoute)
  const [coach, setCoach] = useState(() => flag('fl:coach'))
  const [account, setAccount] = useState<Account | null>(loadAccount)
  const [welcome, setWelcome] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState(0)
  const [routeShare, setRouteShare] = useState<{ count: number; total: number } | null>(null)

  // Follow the clock: a tab left open past midnight should move on to the new day's puzzle.
  useEffect(() => {
    const tick = () => setToday((t) => {
      const now = localDateKey()
      if (now === t) return t
      setRolledFrom(t)
      return now
    })
    const timer = setInterval(tick, 15_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick) }
  }, [])

  // If the day you were playing is already finished when the clock rolls over, move straight to the new one.
  useEffect(() => {
    if (!rolledFrom || mode.kind !== 'daily' || mode.date !== rolledFrom) return
    if ((mode.track === 'all' ? results : homeResults)[rolledFrom]) setMode({ kind: 'daily', date: today, track: mode.track })
  }, [rolledFrom, today, mode, results, homeResults])

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
        const shared = FREE_LINK && freeFromLink(index, FREE_LINK)
        if (shared) setMode({ kind: 'free', n: 1, ...shared })
      })
      .catch(() => setError('Could not load film data.'))
  }, [])

  // The home-industry schedule loads only for players who picked one.
  useEffect(() => {
    setHomeFile(null)
    setHomeFailed(false)
    if (!settings.home || !idx) return
    const home = settings.home
    fetchJSON<PuzzleFile>(`puzzles-${home}.json`)
      .then((p) => {
        setHomeFile(p)
        setHomeResults(validResults(idx, p, loadResults(home)))
      })
      .catch(() => { setHomeFile(null); setHomeFailed(true) })
  }, [settings.home, idx])

  /** Push local results up and adopt the merged set (server keeps the first result per day). */
  const pushResults = useCallback(
    (local: Record<string, Result>) => {
      if (!account || !idx || !file) return
      const cleanLocal = validResults(idx, file, local)
      sync(account, cleanLocal)
        .then((r) => {
          const merged = validResults(idx, file, { ...cleanLocal, ...r.results })
          saveResults(merged)
          setResults((prev) => validResults(idx, file, { ...prev, ...merged }))
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

  // First time someone reaches the game, run the guided example (unless they already started from a face).
  useEffect(() => {
    if (route !== 'play' || !idx || flag('fl:seen')) return
    setSheet('how')
    flag('fl:seen', true)
  }, [route, idx])

  const playRandom = useCallback(
    (par: number) => {
      if (!idx) return
      const p = randomPuzzle(idx, par, Math.random, new Set(loadRecentFilms()))
      if (p) {
        rememberFilms(p.s, p.e)
        setMode((m) => ({ kind: 'free', puzzle: p, n: m.kind === 'free' ? m.n + 1 : 1 }))
      }
      setSheet(null)
    },
    [idx],
  )

  const updateSettings = (next: typeof settings) => {
    setSettings(next)
    saveSettings(next)
  }

  const streak = computeStats(results, today).streak
  // The newest India daily played on its own day, so a subscribed browser isn't reminded after playing.
  const lastPlayed = Object.keys(results).reduce((m, d) => (results[d].live && d > m ? d : m), '')
  useEffect(() => reportPlayed({ last: lastPlayed, streak }), [lastPlayed, streak])
  // A challenge points at one India daily, today's or an earlier one; the friend's chain is rebuilt from the graph.
  const challenge = (() => {
    if (!CHALLENGE || !file) return null
    const date = addDays(file.epoch, CHALLENGE.no - 1)
    const pz = date <= today ? puzzleFor(file, date) : null
    if (!pz || !validChallenge(CHALLENGE.links, pz.par)) return null
    let path: Node[] | null = null
    if (idx && CHALLENGE.mids.length === CHALLENGE.links * 2 - 1) {
      const full: Node[] = [
        { kind: 'film', id: pz.s },
        ...CHALLENGE.mids.map((id, i): Node => ({ kind: i % 2 === 0 ? 'person' : 'film', id })),
        { kind: 'film', id: pz.e },
      ]
      if (isValidChain(idx, full, pz.s, pz.e) && linkCount(full) === CHALLENGE.links) path = full
    }
    return { date, links: CHALLENGE.links, path }
  })()
  const playDate = challenge?.date ?? today

  // Arriving from a link to an earlier puzzle: open that one instead of today's.
  useEffect(() => {
    if (challenge && challenge.date !== today) setMode({ kind: 'daily', date: challenge.date, track: 'all' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!file])

  /** Start today's daily from the landing page with a first person already picked. */
  const startFrom = (personId: string) => {
    const pz = file && puzzleFor(file, playDate)
    if (!pz) return
    // Never clobber a game already under way or finished today; only a fresh daily starts from the face.
    const underway = (validProgress(idx!, playDate, pz.s, 'all')?.path.length ?? 0) > 1
    if (!results[playDate] && !underway) {
      saveProgress(playDate, { path: [{ kind: 'film', id: pz.s }, { kind: 'person', id: personId }], startedAt: Date.now(), hints: 0 })
      flag('fl:coach', true)
      setCoach(true)
    }
    flag('fl:seen', true)
    setMode({ kind: 'daily', date: playDate, track: 'all' })
    navigate('play')
  }

  if (route === 'landing') {
    return (
      <Landing
        idx={idx}
        file={file}
        today={playDate}
        challenge={challenge}
        onStartFrom={startFrom}
        onWalkthroughDone={() => { flag('fl:seen', true); setMode({ kind: 'daily', date: playDate, track: 'all' }); navigate('play') }}
        onPlayDaily={() => { setMode({ kind: 'daily', date: playDate, track: 'all' }); navigate('play') }}
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

  const friendHere = mode.kind === 'daily' && track === 'all' && !!challenge && mode.date === challenge.date
  const friend = mode.kind === 'free' ? mode.friend ?? null : friendHere ? challenge : null
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
        ) : home && !homeFailed ? (
          <button disabled className="is-loading"><Icon name="home" size={15} /> {langName(home)} daily</button>
        ) : (
          <button className="track-add" onClick={() => setSheet('home')}><Icon name="plus" size={15} /> Home cinema</button>
        )}
        {home && homeFile && (
          <button className="track-edit" onClick={() => setSheet('home')} aria-label="Change home cinema">Change</button>
        )}
      </div>

      {rolledFrom && mode.kind === 'daily' && mode.date === rolledFrom && (
        <div className="new-day" role="status">
          <span>A new puzzle is ready.</span>
          <button className="btn primary sm" onClick={() => setMode({ kind: 'daily', date: today, track })}>
            Play #{puzzleNumber(activeFile, today)}
          </button>
        </div>
      )}

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
          dailyNo={mode.kind === 'daily' && track === 'all' ? dailyNo : null}
          free={mode.kind === 'free'}
          challenge={friend?.links ?? null}
          friendPath={friend?.path ?? null}
          coach={coach && mode.kind === 'daily'}
          routeShare={mode.kind === 'daily' && mode.date === today && track === 'all' ? routeShare : null}
          initialResult={mode.kind === 'daily' ? activeResults[mode.date] ?? null : null}
          initialProgress={mode.kind === 'daily' ? validProgress(idx, mode.date, puzzle.s, track) : null}
          onProgress={(p) => mode.kind === 'daily' && saveProgress(mode.date, p, track)}
          onFinish={(r) => {
            if (coach) {
              flag('fl:coach', false)
              setCoach(false)
            }
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
