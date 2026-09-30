import { useCallback, useEffect, useState } from 'react'
import Game from './components/Game'
import Landing from './components/Landing'
import { Archive, HowTo, Stats } from './components/Modals'
import { buildIndex, isValidChain, randomPuzzle, type GraphData, type Index } from './lib/graph'
import { localDateKey, puzzleFor, puzzleNumber, type PuzzleDef, type PuzzleFile } from './lib/daily'
import {
  loadProgress, loadResults, loadSettings, saveProgress, saveResult, saveSettings, type Result,
} from './lib/storage'

type Mode = { kind: 'daily'; date: string } | { kind: 'free'; puzzle: PuzzleDef; n: number }
type Sheet = 'how' | 'stats' | 'archive' | null

const BASE = import.meta.env.BASE_URL
type Route = 'landing' | 'play'
const routeFromPath = (): Route => (location.pathname.slice(BASE.length).startsWith('play') ? 'play' : 'landing')

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
        // Drop results saved against an older dataset or schedule (ids/puzzles no longer match).
        const valid: Record<string, Result> = {}
        for (const [d, r] of Object.entries(loadResults())) {
          const pz = puzzleFor(p, d)
          if (pz && r.par === pz.par && isValidChain(index, r.path, pz.s, r.gaveUp ? undefined : pz.e)) valid[d] = r
        }
        setResults(valid)
      })
      .catch(() => setError('Could not load film data.'))
  }, [])

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
          <button className={`nav-btn ${mode.kind === 'daily' && mode.date === today ? 'on' : ''}`}
            onClick={() => setMode({ kind: 'daily', date: today })}>Daily</button>
          <button className={`nav-btn ${mode.kind === 'free' ? 'on' : ''}`} onClick={() => playRandom(3)}>Random</button>
          <button className="nav-btn" onClick={() => setSheet('archive')}>Archive</button>
          <button className="nav-btn" onClick={() => setSheet('stats')}>Stats</button>
          <button className="icon-btn" onClick={() => setSheet('how')} aria-label="How to play">?</button>
          <label className="toggle" title="No hints, no film counts">
            <input type="checkbox" checked={settings.hard} onChange={toggleHard} />
            <span>Hard</span>
          </label>
        </nav>
      </header>

      {mode.kind === 'free' && (
        <div className="free-bar">
          New random chain:
          <button onClick={() => playRandom(2)}>Easy</button>
          <button onClick={() => playRandom(3)}>Medium</button>
          <button onClick={() => playRandom(4)}>Hard</button>
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
            const full = { ...r, live: mode.date === today }
            saveResult(mode.date, full)
            setResults((prev) => ({ ...prev, [mode.date]: full }))
          }}
          onNewRandom={playRandom}
          onOpenArchive={() => setSheet('archive')}
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
      {sheet === 'stats' && <Stats results={results} today={today} onClose={() => setSheet(null)} />}
      {sheet === 'archive' && (
        <Archive idx={idx} file={file} today={today} results={results} onClose={() => setSheet(null)}
          onPick={(d) => { setMode({ kind: 'daily', date: d }); setSheet(null) }} />
      )}
    </div>
  )
}
