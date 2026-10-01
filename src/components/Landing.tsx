import { useMemo } from 'react'
import { Icon, LangTag, Poster } from './Bits'
import type { Index } from '../lib/graph'
import { puzzleFor, puzzleNumber, type PuzzleFile } from '../lib/daily'

interface Props {
  idx: Index | null
  file: PuzzleFile | null
  today: string
  onPlayDaily: () => void
  onPlayRandom: () => void
}

/**
 * First-visit page: today's two films as a double bill and one question. Returning players skip
 * straight to the game, so this only has to sell the first puzzle.
 */
export default function Landing({ idx, file, today, onPlayDaily, onPlayRandom }: Props) {
  const puzzleNo = file ? puzzleNumber(file, today) : null
  const puzzle = file ? puzzleFor(file, today) : null
  const ready = idx && puzzle
  const languages = useMemo(() => (idx ? new Set(Object.values(idx.data.films).map((f) => f.l)).size : 0), [idx])
  const date = new Date(today + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

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
        <p className="bill-kicker">{puzzleNo ? `Daily #${puzzleNo}` : 'Daily'} · {date}</p>
        {puzzle?.theme && <p className="theme-ribbon">{puzzle.theme}</p>}

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

        <h1>Can you connect them?</h1>
        <p className="bill-lede">
          Hop from film to film through the people who made them: actors, directors, composers.
          {puzzle ? ` The shortest chain is ${puzzle.par} people.` : ''}
        </p>
        <div className="bill-ctas">
          <button className="btn primary lg" onClick={onPlayDaily}><Icon name="play" size={16} /> Play today’s puzzle</button>
          <button className="link-btn" onClick={onPlayRandom} disabled={!idx}>or try a random chain</button>
        </div>

        <ol className="bill-steps">
          <li><b>1</b> Start at a film</li>
          <li><b>2</b> Hop through someone who worked on it</li>
          <li><b>3</b> Reach the target in the fewest links</li>
        </ol>
      </section>

      <footer className="footer">
        {idx && <p>{idx.data.meta.films.toLocaleString('en-IN')} films · {languages} languages · a new puzzle every midnight</p>}
        <p>
          Film data from <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDb</a>. This product
          uses the TMDb API but is not endorsed or certified by TMDb.
        </p>
      </footer>
    </div>
  )
}
