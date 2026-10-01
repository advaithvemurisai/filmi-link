import { useMemo } from 'react'
import { Avatar, Icon, LangTag, Poster, ROLE_ICON } from './Bits'
import Programme from './Programme'
import Walkthrough from './Walkthrough'
import { MIN_START_FACES, startFaces, type Index } from '../lib/graph'
import { puzzleFor, puzzleNumber, type PuzzleFile } from '../lib/daily'

interface Props {
  idx: Index | null
  file: PuzzleFile | null
  today: string
  /** Links a friend used today, when the visitor arrived from their share link. */
  challenge: { links: number } | null
  onStartFrom: (personId: string) => void
  /** The visitor finished the on-page walkthrough: go play today's puzzle. */
  onWalkthroughDone: () => void
  onPlayDaily: () => void
  onPlayRandom: () => void
}

// Matches the generator's route band: forgiving early in the week, tight at the weekend.
const DIFFICULTY = ['Hard', 'Easy', 'Easy', 'Medium', 'Medium', 'Medium', 'Hard']
const REPO = 'https://github.com/advaithvemurisai/filmi-link#puzzle-pipeline'

/**
 * First-visit page: today's two films as a double bill, and the puzzle's first move. Tapping a face
 * starts the daily with that person already in the chain. Returning players skip this page.
 */
export default function Landing({ idx, file, today, challenge, onStartFrom, onWalkthroughDone, onPlayDaily, onPlayRandom }: Props) {
  const puzzleNo = file ? puzzleNumber(file, today) : null
  const puzzle = file ? puzzleFor(file, today) : null
  const ready = idx && puzzle
  const languages = useMemo(() => (idx ? new Set(Object.values(idx.data.films).map((f) => f.l)).size : 0), [idx])
  const day = new Date(today + 'T00:00')
  const date = day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

  // The start film's director, composer and top-billed cast: the first move, playable right here.
  const faces = useMemo(() => {
    if (!idx || !puzzle) return []
    const roles = new Map((idx.filmCredits[puzzle.s] ?? []).map((c) => [c.id, c.role]))
    const ids = startFaces(idx, puzzle.s)
    return ids.length >= MIN_START_FACES ? ids.map((id) => ({ id, role: roles.get(id)! })) : []
  }, [idx, puzzle])

  return (
    <div className="landing">
      <header className="topbar landing-nav">
        <a className="brand" href="#top">
          <span className="reel" aria-hidden />
          <span>Cinematic<em>Link</em></span>
        </a>
        <button className="btn primary sm" onClick={onPlayDaily}>Play</button>
      </header>

      <section className="bill" id="top">
        <p className="bill-kicker">
          {puzzleNo ? `Daily #${puzzleNo}` : 'Daily'} · {date} · {DIFFICULTY[day.getDay()]}
        </p>
        {puzzle?.theme && <p className="theme-ribbon">{puzzle.theme}</p>}

        <h1>
          {challenge
            ? <>A friend linked these in {challenge.links} link{challenge.links === 1 ? '' : 's'}. <em>Can you beat it?</em></>
            : 'Can you connect them?'}
        </h1>

        <div className="bill-posters">
          {ready ? (
            <>
              <figure className="bill-film">
                <Poster idx={idx} id={puzzle.s} size="xl" />
                <figcaption>
                  <b>{idx.data.films[puzzle.s].t}</b>
                  <span>{idx.data.films[puzzle.s].y} <LangTag l={idx.data.films[puzzle.s].l} /></span>
                </figcaption>
              </figure>
              <div className="bill-gap" aria-label={`Shortest chain: ${puzzle.par} links`}>
                {Array.from({ length: puzzle.par }, (_, i) => <i key={i} />)}
              </div>
              <figure className="bill-film is-target">
                <Poster idx={idx} id={puzzle.e} size="xl" />
                <figcaption>
                  <b>{idx.data.films[puzzle.e].t}</b>
                  <span>{idx.data.films[puzzle.e].y} <LangTag l={idx.data.films[puzzle.e].l} /></span>
                </figcaption>
              </figure>
            </>
          ) : (
            <><div className="bill-skeleton" /><div className="bill-gap" /><div className="bill-skeleton" /></>
          )}
        </div>

        {ready && faces.length > 0 && (
          <div className="bill-start">
            <p>Tap anyone who worked on <b>{idx.data.films[puzzle.s].t}</b> to start:</p>
            <ul className="bill-faces">
              {faces.map((c, i) => (
                <li key={c.id} style={{ animationDelay: `${300 + i * 50}ms` }}>
                  <button onClick={() => onStartFrom(c.id)} title={`Start with ${idx.data.people[c.id].n}`}>
                    <span className="bill-face-art">
                      <Avatar idx={idx} id={c.id} size="lg" />
                      {c.role !== 'Actor' && <span className="card-role" aria-hidden><Icon name={ROLE_ICON[c.role]} size={12} /></span>}
                    </span>
                    <span>{idx.data.people[c.id].n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bill-ctas">
          <button className="btn primary lg" onClick={onPlayDaily}><Icon name="play" size={16} /> Play today’s puzzle</button>
          <button className="link-btn" onClick={onPlayRandom} disabled={!idx}>or try a random chain</button>
        </div>

        <p className="bill-rule">
          Hop film → person → film through actors, directors and composers.
          {puzzle ? ` Reach the target in ${puzzle.par} links for a Blockbuster.` : ''}
        </p>
      </section>

      <section className="scene" id="learn">
        <p className="scene-kicker">Try it</p>
        <h2>Learn it in 20 seconds</h2>
        <p className="scene-lede">Tap through a real chain. This is the whole game.</p>
        <div className="screening">
          <p className="screening-bar"><span>Now showing</span><span>A 2-link chain</span></p>
          {idx
            ? <Walkthrough idx={idx} doneLabel="Play today’s puzzle" onDone={onWalkthroughDone} />
            : <div className="bill-skeleton screening-skeleton" />}
        </div>
      </section>

      <section className="scene" id="inside">
        <p className="scene-kicker">The programme</p>
        <h2>What’s inside</h2>
        <Programme />
        <div className="scene-cta">
          <button className="btn primary lg" onClick={onPlayDaily}><Icon name="play" size={16} /> Play today’s puzzle</button>
        </div>
      </section>

      <footer className="footer">
        {idx && (
          <p>
            {idx.data.meta.films.toLocaleString('en-IN')} films · {languages} languages · a new puzzle every midnight ·{' '}
            <a href={REPO} target="_blank" rel="noreferrer">How the puzzles are made →</a>
          </p>
        )}
        <p>
          Film data from <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDb</a>. This product
          uses the TMDb API but is not endorsed or certified by TMDb.
        </p>
      </footer>
    </div>
  )
}
