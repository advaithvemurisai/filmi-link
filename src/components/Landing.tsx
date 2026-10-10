import { useMemo } from 'react'
import { Avatar, Icon, LangTag, Poster } from './Bits'
import { ROLE_ICON } from './bit-helpers'
import Credits from './Credits'
import Walkthrough from './Walkthrough'
import { MIN_START_FACES, startFaces, type Index } from '../lib/graph'
import type { LandingPreview } from '../App'
import { RULES, difficultyOf, puzzleFor, puzzleNumber, ruleOf, type PuzzleFile } from '../lib/daily'

interface Props {
  idx: Index | null
  /** Today's films and first move from landing.json, used until the full graph arrives. */
  preview: LandingPreview | null
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

const REPO = 'https://github.com/advaithvemurisai/filmi-link#puzzle-pipeline'

/**
 * First-visit page: today's two films as a double bill, and the puzzle's first move. Tapping a face
 * starts the daily with that person already in the chain. Returning players skip this page.
 */
export default function Landing({ idx: full, preview, file, today, challenge, onStartFrom, onWalkthroughDone, onPlayDaily, onPlayRandom }: Props) {
  const puzzleNo = file ? puzzleNumber(file, today) : null
  const puzzle = file ? puzzleFor(file, today) : null
  // The double bill and first move draw from the full graph once it's in, and from the preview before.
  const previewHas = !!puzzle && !!preview && puzzle.s in preview.idx.data.films && puzzle.e in preview.idx.data.films
  const idx = full ?? (previewHas ? preview!.idx : null)
  const ready = idx && puzzle
  const languages = useMemo(() => (full ? new Set(Object.values(full.data.films).map((f) => f.l)).size : 0), [full])
  const day = new Date(today + 'T00:00')
  const date = day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const links = puzzle ? `${puzzle.par} link${puzzle.par === 1 ? '' : 's'}` : null

  // The start film's director, composer and top-billed cast: the first move, playable right here.
  const faces = useMemo(() => {
    if (!puzzle) return []
    if (!full) return (previewHas && preview!.faces[today]) || []
    const idx = full
    const roles = new Map((idx.filmCredits[puzzle.s] ?? []).map((c) => [c.id, c.role]))
    const ids = startFaces(idx, puzzle.s, 8, ruleOf(puzzle))
    return ids.length >= MIN_START_FACES ? ids.map((id) => ({ id, role: roles.get(id)! })) : []
  }, [full, preview, previewHas, puzzle, today])

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
        {/* A cinema letterboard: today's show, put up by hand. */}
        <div className="marquee">
          <p className="marquee-top">
            Now showing{puzzleNo ? ` · No. ${puzzleNo}` : ''} · {date}{puzzle ? ` · ${difficultyOf(puzzle)}` : ''}{puzzle?.rule ? ` · ${RULES[puzzle.rule].name}` : ''}
          </p>
          <h1>
            {challenge
              ? <>A friend did it in {challenge.links} link{challenge.links === 1 ? '' : 's'}. <em>Can you beat that?</em></>
              : links
                ? <>Two films. <em>{links}</em> between them.</>
                : 'Two films. One chain of people.'}
          </h1>
        </div>
        {puzzle?.theme && <p className="bill-meta"><span className="theme-ribbon">{puzzle.theme}</span></p>}

        <div className="bill-posters">
          {ready ? (
            <>
              <figure className="bill-film">
                <Poster idx={idx} id={puzzle.s} size="xl" />
                <figcaption>
                  <small>From</small>
                  <b>{idx.data.films[puzzle.s].t}</b>
                  <span>{idx.data.films[puzzle.s].y} <LangTag l={idx.data.films[puzzle.s].l} /></span>
                </figcaption>
              </figure>
              <div className="bill-gap" aria-label={`Shortest chain: ${links}`}>
                {Array.from({ length: puzzle.par }, (_, i) => <i key={i} />)}
              </div>
              <figure className="bill-film is-target">
                <Poster idx={idx} id={puzzle.e} size="xl" />
                <figcaption>
                  <small>To</small>
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
            <p><span className="step-no">1</span> Pick a connector from <b>{idx.data.films[puzzle.s].t}</b>
              {puzzle.rule ? <> — <b>{RULES[puzzle.rule].name}:</b> {RULES[puzzle.rule].line}</> : ' — directors, composers and actors all count.'}</p>
            <ul className="bill-faces">
              {faces.map((c, i) => (
                <li key={c.id} style={{ animationDelay: `${300 + i * 50}ms` }}>
                  <button onClick={() => onStartFrom(c.id)} title={`Start with ${idx.data.people[c.id].n} · ${c.role}`}>
                    <span className="bill-face-art">
                      <Avatar idx={idx} id={c.id} size="lg" />
                      <span className="card-role" aria-hidden><Icon name={ROLE_ICON[c.role]} size={12} /></span>
                    </span>
                    <span>{idx.data.people[c.id].n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={`bill-ctas ${faces.length > 0 ? 'is-quiet' : ''}`}>
          {faces.length > 0
            ? <button className="link-btn" onClick={onPlayDaily}>Open the full puzzle</button>
            : <button className="btn primary lg" onClick={onPlayDaily}><Icon name="play" size={16} /> Play today’s puzzle</button>}
          <span aria-hidden>·</span>
          <button className="link-btn" onClick={onPlayRandom} disabled={!full}>Random chain</button>
        </div>
      </section>

      <div className="interval" role="separator" aria-label="Interval"><span>Interval</span></div>

      <section className="short" id="learn">
        <header className="short-head">
          <h2>Trailer</h2>
          <span className="short-runtime">0:20</span>
          <p>Every link is a person, then a film they made. Try a two-link chain before today’s show.</p>
        </header>
        <div className="screen">
          {full
            ? <Walkthrough idx={full} doneLabel="Now play today’s" onDone={onWalkthroughDone} />
            : <div className="bill-skeleton screen-skeleton" />}
        </div>
      </section>

      <section className="end-credits" id="inside">
        <Credits />
        <p className="credits-fin">and a new show every midnight</p>
        {/* The closing call to action is the ticket you hand over at the door. */}
        <button className="door-ticket" onClick={onPlayDaily}>
          <span className="door-ticket-main">
            <small>Admit one</small>
            <b>Today’s show{puzzleNo ? `, No. ${puzzleNo}` : ''}</b>
          </span>
          <span className="door-ticket-stub"><Icon name="play" size={18} /></span>
        </button>
      </section>

      <footer className="footer">
        {full && (
          <p>
            {full.data.meta.films.toLocaleString('en-IN')} films · {languages} languages · a new puzzle every midnight ·{' '}
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
