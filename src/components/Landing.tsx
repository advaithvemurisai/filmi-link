import { useMemo } from 'react'
import { Avatar, LangTag, Poster } from './Bits'
import { shortestPath, type Index, type Node } from '../lib/graph'
import { puzzleNumber, type PuzzleFile } from '../lib/daily'
import { langName } from '../lib/format'

interface Props {
  idx: Index | null
  file: PuzzleFile | null
  today: string
  onPlayDaily: () => void
  onPlayRandom: () => void
}

// A showcase chain across industries. Fixed pairs, never today's puzzle, so the hero can't spoil it.
const SHOWCASE: [string, string][] = [
  ['RRR', 'Kumbalangi Nights'],
  ['Baahubali: The Beginning', '3 Idiots'],
  ['Vikram', 'Gully Boy'],
]

const FEATURES = [
  { icon: '📅', title: 'A new puzzle every day', body: 'Everyone gets the same pair of films. Difficulty rises through the week, from quick Monday warm-ups to weekend brain-teasers.' },
  { icon: '✅', title: 'Verified par', body: 'Every puzzle is checked solvable in advance, and par is the true shortest chain, computed across the whole film network.' },
  { icon: '🏆', title: 'Results worth sharing', body: 'See your chain next to an optimal one, then share a spoiler-free result card with friends.' },
  { icon: '💡', title: 'Hints when you need them', body: 'Stuck? A hint reveals the next step on a shortest route from wherever you are.' },
  { icon: '🔥', title: 'Hard mode', body: 'No hints and no film counts. Just you and your knowledge of Indian cinema.' },
  { icon: '🎲', title: 'Endless random play', body: 'Can’t wait until tomorrow? Play unlimited random chains at easy, medium or hard.' },
  { icon: '🗂️', title: 'Archive and stats', body: 'Replay past puzzles, track your streaks, and see how often you hit par.' },
  { icon: '🌏', title: 'Every industry', body: 'Bollywood, Kollywood, Tollywood, Mollywood, Sandalwood and beyond, all connected in one graph.' },
]

export default function Landing({ idx, file, today, onPlayDaily, onPlayRandom }: Props) {
  const puzzleNo = file ? puzzleNumber(file, today) : null

  const showcase = useMemo(() => {
    if (!idx) return null
    const byTitle = new Map<string, string>()
    // Prefer the most-voted film when titles collide (remakes, re-releases).
    for (const [id, f] of Object.entries(idx.data.films)) {
      const prev = byTitle.get(f.t)
      if (!prev || idx.data.films[prev].pop < f.pop) byTitle.set(f.t, id)
    }
    for (const [a, b] of SHOWCASE) {
      const s = byTitle.get(a)
      const e = byTitle.get(b)
      const path = s && e ? shortestPath(idx, { kind: 'film', id: s }, e) : null
      if (path && path.length <= 7) return path
    }
    return null
  }, [idx])

  const languages = useMemo(() => {
    if (!idx) return []
    const counts = new Map<string, number>()
    for (const f of Object.values(idx.data.films)) counts.set(f.l, (counts.get(f.l) ?? 0) + 1)
    return [...counts.entries()].filter(([l]) => langName(l) !== l.toUpperCase()).sort((a, b) => b[1] - a[1])
  }, [idx])

  const fmt = (n: number) => n.toLocaleString('en-IN')

  return (
    <div className="landing">
      <header className="topbar landing-nav">
        <a className="brand" href="#top">
          <span className="reel" aria-hidden />
          <span>Cinematic<em>Link</em></span>
        </a>
        <nav>
          <a className="nav-btn" href="#how">How it works</a>
          <a className="nav-btn" href="#features">Features</a>
          <button className="btn primary sm" onClick={onPlayDaily}>Play now</button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="dot" /> {puzzleNo ? `Daily puzzle #${puzzleNo} is live` : 'The daily Indian cinema puzzle'}
          </p>
          <h1>
            Every Indian film is <em>closer</em> than you think.
          </h1>
          <p className="lede">
            Connect two films through the actors, directors and composers who made them. A daily puzzle
            built on {idx ? fmt(idx.data.meta.films) : 'thousands of'} films from every corner of Indian cinema.
          </p>
          <div className="hero-ctas">
            <button className="btn primary lg" onClick={onPlayDaily}>Play today’s puzzle →</button>
            <button className="btn lg" onClick={onPlayRandom} disabled={!idx}>Try a random chain</button>
          </div>
          <p className="hero-note">Free · No sign-up · Takes about 2 minutes</p>
        </div>

        <div className="hero-visual" aria-label="Example chain">
          {showcase ? (
            <ol className="showcase">
              {showcase.map((n, i) => (
                <ShowcaseStep key={n.kind + n.id} idx={idx!} node={n} i={i} last={i === showcase.length - 1} />
              ))}
            </ol>
          ) : (
            <div className="showcase-skeleton">
              {Array.from({ length: 5 }, (_, i) => <div key={i} className={i % 2 ? 'sk-pill' : 'sk-card'} />)}
            </div>
          )}
          {showcase && (
            <p className="showcase-caption">
              {showcase.filter((n) => n.kind === 'person').length} links from{' '}
              <b>{langName(idx!.data.films[showcase[0].id].l)}</b> to{' '}
              <b>{langName(idx!.data.films[showcase[showcase.length - 1].id].l)}</b> cinema
            </p>
          )}
        </div>
      </section>

      <section className="stat-band" aria-label="By the numbers">
        <div><b>{idx ? fmt(idx.data.meta.films) : '—'}</b><span>Films</span></div>
        <div><b>{idx ? fmt(idx.data.meta.people) : '—'}</b><span>Actors, directors &amp; composers</span></div>
        <div><b>{languages.length || '—'}</b><span>Languages</span></div>
        <div><b>1</b><span>New puzzle every day</span></div>
      </section>

      <section className="section" id="how">
        <p className="kicker">How it works</p>
        <h2>Three steps. One perfect chain.</h2>
        <div className="steps">
          <div className="step">
            <span className="step-no">1</span>
            <h3>Get two films</h3>
            <p>Each day brings a start film and a target, often from different industries and decades.</p>
          </div>
          <div className="step">
            <span className="step-no">2</span>
            <h3>Follow the people</h3>
            <p>Jump from a film to someone who worked on it, then to another of their films. Plan from both ends.</p>
          </div>
          <div className="step">
            <span className="step-no">3</span>
            <h3>Beat par</h3>
            <p>Each person is one link. Match the shortest possible chain, then share your result.</p>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <p className="kicker">Features</p>
        <h2>Built for film lovers who like a challenge.</h2>
        <div className="features">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              <span className="feature-icon" aria-hidden>{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {languages.length > 0 && (
        <section className="section">
          <p className="kicker">Coverage</p>
          <h2>From Hindi blockbusters to Assamese indies.</h2>
          <div className="lang-cloud">
            {languages.map(([l, n]) => (
              <span key={l} className="lang-chip">
                <LangTag l={l} /> <b>{fmt(n)}</b> films
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="cta-band">
        <h2>Today’s chain is waiting.</h2>
        <p>{puzzleNo ? `Puzzle #${puzzleNo}` : 'A new puzzle'} resets at midnight. Can you hit par?</p>
        <button className="btn primary lg" onClick={onPlayDaily}>Play today’s puzzle →</button>
      </section>

      <footer className="footer">
        Film data from <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDb</a>. This product
        uses the TMDb API but is not endorsed or certified by TMDb.
      </footer>
    </div>
  )
}

function ShowcaseStep({ idx, node, i, last }: { idx: Index; node: Node; i: number; last: boolean }) {
  const style = { animationDelay: `${i * 120}ms` }
  if (node.kind === 'person') {
    return (
      <li className="sc-person" style={style}>
        <Avatar idx={idx} id={node.id} size="sm" />
        <span>{idx.data.people[node.id].n}</span>
      </li>
    )
  }
  const f = idx.data.films[node.id]
  return (
    <li className={`sc-film ${i === 0 ? 'is-start' : ''} ${last ? 'is-end' : ''}`} style={style}>
      <Poster idx={idx} id={node.id} />
      <div>
        <p className="kicker">{i === 0 ? 'Start' : last ? 'Target' : 'Via'}</p>
        <h3>{f.t}</h3>
        <p className="meta">{f.y} <LangTag l={f.l} /></p>
      </div>
    </li>
  )
}
