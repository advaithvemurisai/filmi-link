import { useCallback, useEffect, useState } from 'react'
import Game from './components/Game'
import Landing from './components/Landing'
import { PlayerBadge } from './components/Bits'
import { Archive, HowTo, Stats } from './components/Modals'
import { AccountSheet, FriendsSheet } from './components/Social'
import { buildIndex, isValidChain, randomPuzzle, type GraphData, type Index } from './lib/graph'
import { localDateKey, puzzleFor, puzzleNumber, type PuzzleDef, type PuzzleFile } from './lib/daily'
import {
  computeStats, loadProgress, loadResults, loadSettings, saveProgress, saveResults, saveSettings, type Result,
} from './lib/storage'
import { loadAccount, saveAccount, sync, SyncError, type Account } from './lib/account'

type Mode = { kind: 'daily'; date: string } | { kind: 'free'; puzzle: PuzzleDef; n: number }
type Sheet = 'how' | 'stats' | 'archive' | 'account' | 'friends' | null

const BASE = import.meta.env.BASE_URL
type Route = 'landing' | 'play'
const routeFromPath = (): Route => (location.pathname.slice(BASE.length).startsWith('play') ? 'play' : 'landing')

/** Drop results saved against an older dataset or schedule (ids/puzzles no longer match). */
function validResults(idx: Index, file: PuzzleFile, results: Record<string, Result>) {
  const valid: Record<string, Result> = {}
  for (const [d, r] of Object.entries(results)) {
    const pz = puzzleFor(file, d)
    if (pz && r.par === pz.par && isValidChain(idx, r.path, pz.s, r.gaveUp ? undefined : pz.e)) valid[d] = r
  }
  return valid
}

function validProgress(idx: Index, date: string, start: string) {
  const p = loadProgress(date)
  return p && isValidChain(idx, p.path, start) ? p : null
}

export default function App() {
  const [idx, setIdx] = useState<Index | null>(null)
  const [file, setFile] = useState<PuzzleFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [today] = useState(localDateKey)
  const [mode, setMode] = useState<Mode>({ kind: 'daily', date: today })
  const [sheet, setSheet] = useState<Sheet>(null)
  const [results, setResults] = useState<Record<string, Result>>(loadResults)
  const [settings, setSettings] = useState(loadSettings)
  const [route, setRoute] = useState<Route>(routeFromPath)
  const [account, setAccount] = useState<Account | null>(loadAccount)
  const [welcome, setWelcome] = useState<string | null>(null)

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
    Promise.all([
      fetch(`${BASE}data/graph.json`).then((r) => r.json() as Promise<GraphData>),
      fetch(`${BASE}data/puzzles.json`).then((r) => r.json() as Promise<PuzzleFile>),
    ])
      .then(([g, p]) => {
        const index = buildIndex(g)
        setIdx(index)
        setFile(p)
        setResults(validResults(index, p, loadResults()))
      })
      .catch(() => setError('Could not load film data.'))
  }, [])

  /** Push local results up and adopt the merged set (server keeps the first result per day). */
  const pushResults = useCallback(
    (local: Record<string, Result>) => {
      if (!account || !idx || !file) return
      sync(account, local)
        .then((r) => {
          const merged = validResults(idx, file, { ...local, ...r.results })
          saveResults(merged)
          setResults(merged)
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

  // First time someone reaches the game, show How to play.
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

  const streak = computeStats(results, today).streak

  if (route === 'landing') {
    return (
      <Landing
        idx={idx}
        file={file}
        today={today}
        onPlayDaily={() => { setMode({ kind: 'daily', date: today }); navigate('play') }}
        onPlayRandom={() => { playRandom(3); navigate('play') }}
      />
    )
  }
  if (error) return <div className="splash">{error}</div>
  if (!idx || !file) return <div className="splash"><span className="reel" /> Loading reels…</div>

  const dailyNo = mode.kind === 'daily' ? puzzleNumber(file, mode.date) : null
  const puzzle = mode.kind === 'daily' ? puzzleFor(file, mode.date) : mode.puzzle
  const label =
    mode.kind === 'free'
      ? 'Free play'
      : `#${dailyNo}${mode.date === today ? ' · Today' : ''}`
  const shareTitle = mode.kind === 'free' ? 'CinematicLink · free play 🎬' : `CinematicLink #${dailyNo} 🎬${settings.hard ? ' (hard)' : ''}`

  const toggleHard = () => {
    const next = { ...settings, hard: !settings.hard }
    setSettings(next)
    saveSettings(next)
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => navigate('landing')} title="Home">
          <span className="reel" aria-hidden />
          <span>Cinematic<em>Link</em></span>
        </button>
        <nav>
          <NavBtn icon="📅" label="Daily" on={mode.kind === 'daily' && mode.date === today} onClick={() => setMode({ kind: 'daily', date: today })} />
          <NavBtn icon="🎲" label="Random" on={mode.kind === 'free'} onClick={() => playRandom(3)} />
          <NavBtn icon="🗂" label="Archive" onClick={() => setSheet('archive')} />
          <NavBtn icon="📊" label="Stats" onClick={() => setSheet('stats')} />
          <NavBtn icon="🏆" label="Friends" onClick={() => setSheet('friends')} />
          <button className="icon-btn" onClick={() => setSheet('how')} aria-label="How to play">?</button>
          <label className={`toggle ${settings.hard ? 'on' : ''}`} title="Hard mode: no hints, no signal bars">
            <input type="checkbox" checked={settings.hard} onChange={toggleHard} />
            <span>🔥 Hard</span>
          </label>
        </nav>
        <button className={`player-pill ${account ? '' : 'is-anon'}`} onClick={() => setSheet('account')}
          title={account ? `Signed in as ${account.name}` : 'Save your streak'}>
          <span className={`pill-flame ${streak ? '' : 'is-cold'}`} aria-hidden>🔥</span>
          <b>{streak}</b>
          {account ? <PlayerBadge name={account.name} size="sm" /> : <span className="pill-cta">Save</span>}
        </button>
      </header>

      {welcome && <div className="toast" role="status" onAnimationEnd={() => setWelcome(null)}>{welcome}</div>}

      {mode.kind === 'free' && (
        <div className="free-bar">
          <span aria-hidden>🎲</span>
          <button onClick={() => playRandom(2)}><i className="lvl" data-l="1" /> Easy</button>
          <button onClick={() => playRandom(3)}><i className="lvl" data-l="2" /> Medium</button>
          <button onClick={() => playRandom(4)}><i className="lvl" data-l="3" /> Hard</button>
        </div>
      )}

      {puzzle ? (
        <Game
          key={mode.kind === 'daily' ? mode.date : `free${mode.n}`}
          idx={idx}
          puzzle={puzzle}
          label={label}
          hard={settings.hard}
          shareTitle={shareTitle}
          initialResult={mode.kind === 'daily' ? results[mode.date] ?? null : null}
          initialProgress={mode.kind === 'daily' ? validProgress(idx, mode.date, puzzle.s) : null}
          onProgress={(p) => mode.kind === 'daily' && saveProgress(mode.date, p)}
          onFinish={(r) => {
            if (mode.kind !== 'daily') return
            const next = { ...results, [mode.date]: { ...r, live: mode.date === today } }
            saveResults(next)
            setResults(next)
            pushResults(next)
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
      {sheet === 'stats' && <Stats results={results} today={today} synced={!!account} onClose={() => setSheet(null)} />}
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
            setWelcome(created ? `🎬 Welcome, ${a.name}! Your streak is saved.` : `👋 Welcome back, ${a.name}`)
          }}
          onSignOut={() => { saveAccount(null); setAccount(null); setSheet(null) }}
        />
      )}
      {sheet === 'friends' && (
        <FriendsSheet account={account} today={today} onClose={() => setSheet(null)} onSignIn={() => setSheet('account')} />
      )}
      {sheet === 'archive' && (
        <Archive idx={idx} file={file} today={today} results={results} onClose={() => setSheet(null)}
          onPick={(d) => { setMode({ kind: 'daily', date: d }); setSheet(null) }} />
      )}
    </div>
  )
}

function NavBtn({ icon, label, on, onClick }: { icon: string; label: string; on?: boolean; onClick: () => void }) {
  return (
    <button className={`nav-btn ${on ? 'on' : ''}`} onClick={onClick} title={label}>
      <span className="nav-ic" aria-hidden>{icon}</span>
      <span className="nav-label">{label}</span>
    </button>
  )
}
