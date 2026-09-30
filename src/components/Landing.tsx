import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Avatar, LangTag, ParMeter, Poster } from './Bits'
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

// Showcase chains across industries. Fixed pairs, never today's puzzle, so the hero can't spoil it.
const SHOWCASE: [string, string][] = [
  ['RRR', 'Kumbalangi Nights'],
  ['Baahubali: The Beginning', '3 Idiots'],
  ['Vikram', 'Gully Boy'],
]
const CYCLE_MS = 7000

const FEATURES = [
  { icon: '📅', title: 'Daily puzzle', body: 'Easy Monday, tough weekend' },
  { icon: '⛳', title: 'Verified par', body: 'True shortest chain' },
  { icon: '🔥', title: 'Streaks', body: 'Synced across devices' },
  { icon: '🏆', title: 'Friends board', body: 'See who hit par today' },
  { icon: '💡', title: 'Hints', body: 'When you’re stuck' },
  { icon: '🎲', title: 'Random play', body: 'Unlimited chains' },
]

export default function Landing({ idx, file, today, onPlayDaily, onPlayRandom }: Props) {
  const puzzleNo = file ? puzzleNumber(file, today) : null

  const showcases = useMemo(() => {
    if (!idx) return []
    const byTitle = new Map<string, string>()
    // Prefer the most-voted film when titles collide (remakes, re-releases).
    for (const [id, f] of Object.entries(idx.data.films)) {
      const prev = byTitle.get(f.t)
      if (!prev || idx.data.films[prev].pop < f.pop) byTitle.set(f.t, id)
    }
    return SHOWCASE.flatMap(([a, b]) => {
      const s = byTitle.get(a)
      const e = byTitle.get(b)
      const path = s && e ? shortestPath(idx, { kind: 'film', id: s }, e) : null
      return path && path.length <= 7 ? [path] : []
    })
  }, [idx])

  const [k, setK] = useState(0)
  useEffect(() => {
    if (showcases.length < 2) return
    const t = setInterval(() => setK((n) => (n + 1) % showcases.length), CYCLE_MS)
    return () => clearInterval(t)
  }, [showcases.length, k])
  const showcase = showcases[k] ?? null

  const languages = useMemo(() => {
    if (!idx) return []
    const counts = new Map<string, number>()
    for (const f of Object.values(idx.data.films)) counts.set(f.l, (counts.get(f.l) ?? 0) + 1)
    return [...counts.entries()].filter(([l]) => langName(l) !== l.toUpperCase()).sort((a, b) => b[1] - a[1])
  }, [idx])
  const totalLang = languages.reduce((s, [, n]) => s + n, 0)

  const fmt = (n: number) => n.toLocaleString('en-IN')
  const demo = showcases[0]

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
            Connect two films through the people who made them. {idx ? fmt(idx.data.meta.films) : 'Thousands of'} films, every industry.
          </p>
          <div className="hero-ctas">
            <button className="btn primary lg" onClick={onPlayDaily}>▶ Play today’s puzzle</button>
            <button className="btn lg" onClick={onPlayRandom} disabled={!idx}>🎲 Random chain</button>
          </div>
          <p className="hero-note">Free · No sign-up · ~2 minutes</p>
        </div>

        <div className="hero-visual" aria-label="Example chain">
          {showcase ? (
            <ol className="showcase" key={k}>
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
            <div className="showcase-foot">
              <p className="showcase-caption">
                <b>{showcase.filter((n) => n.kind === 'person').length} links</b> ·{' '}
                <LangTag l={idx!.data.films[showcase[0].id].l} /> → <LangTag l={idx!.data.films[showcase[showcase.length - 1].id].l} />
              </p>
              {showcases.length > 1 && (
                <div className="showcase-dots">
                  {showcases.map((_, i) => (
                    <button key={i} className={i === k ? 'on' : ''} onClick={() => setK(i)} aria-label={`Example ${i + 1}`}>
                      {i === k && <i style={{ animationDuration: `${CYCLE_MS}ms` }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="stat-band" aria-label="By the numbers">
        <div><span className="stat-ic" aria-hidden>🎞️</span><b>{idx ? fmt(idx.data.meta.films) : '—'}</b><span>Films</span></div>
        <div><span className="stat-ic" aria-hidden>👥</span><b>{idx ? fmt(idx.data.meta.people) : '—'}</b><span>Cast &amp; crew</span></div>
        <div><span className="stat-ic" aria-hidden>🗣️</span><b>{languages.length || '—'}</b><span>Languages</span></div>
        <div><span className="stat-ic" aria-hidden>📅</span><b>1</b><span>Puzzle a day</span></div>
      </section>

      <section className="section" id="how">
        <p className="kicker">How it works</p>
        <h2>Three steps. One perfect chain.</h2>
        <div className="steps">
          <div className="step">
            <div className="step-visual" aria-hidden>
              {demo && idx ? (
                <><Poster idx={idx} id={demo[0].id} size="sm" /><span className="step-arrow">⟶</span><Poster idx={idx} id={demo[demo.length - 1].id} size="sm" /></>
              ) : '🎞️ ⟶ 🎯'}
            </div>
            <span className="step-no">1</span>
            <h3>Get two films</h3>
          </div>
          <div className="step">
            <div className="step-visual" aria-hidden>
              {demo && idx ? (
                <><Poster idx={idx} id={demo[0].id} size="sm" /><i className="step-link" /><Avatar idx={idx} id={demo[1].id} size="sm" /><i className="step-link" /><Poster idx={idx} id={demo[2].id} size="sm" /></>
              ) : '🎞️ 👤 🎞️'}
            </div>
            <span className="step-no">2</span>
            <h3>Hop through people</h3>
          </div>
          <div className="step">
            <div className="step-visual" aria-hidden><ParMeter links={3} par={3} big /></div>
            <span className="step-no">3</span>
            <h3>Hit par, share</h3>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <p className="kicker">Features</p>
        <h2>Built for film lovers who like a challenge.</h2>
        <div className="features">
          {FEATURES.map((f, i) => (
            <div className="feature" key={f.title} style={{ '--i': i } as CSSProperties}>
              <span className="feature-icon" aria-hidden>{f.icon}</span>
              <div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {languages.length > 0 && (
        <section className="section">
          <p className="kicker">Coverage</p>
          <h2>From Hindi blockbusters to Assamese indies.</h2>
          <div className="lang-bar" role="img" aria-label="Films by language">
            {languages.map(([l, n]) => (
              <span key={l} className={`lang-${l}`} style={{ flexGrow: n }} title={`${langName(l)}: ${fmt(n)} films`} />
            ))}
          </div>
          <div className="lang-cloud">
            {languages.map(([l, n]) => (
              <span key={l} className={`lang-chip lang-${l}`}>
                <i /> {langName(l)} <b>{Math.max(1, Math.round((n / totalLang) * 100))}%</b>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="cta-band">
        <span className="cta-reel" aria-hidden />
        <h2>Today’s chain is waiting.</h2>
        <p>{puzzleNo ? `Puzzle #${puzzleNo}` : 'A new puzzle'} · resets at midnight</p>
        <button className="btn primary lg" onClick={onPlayDaily}>▶ Play today’s puzzle</button>
      </section>

      <footer className="footer">
        Film data from <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDb</a>. This product
        uses the TMDb API but is not endorsed or certified by TMDb.
      </footer>
    </div>
  )
}

function ShowcaseStep({ idx, node, i, last }: { idx: Index; node: Node; i: number; last: boolean }) {
  const style = { animationDelay: `${i * 220}ms` }
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
        <p className="kicker">{i === 0 ? 'Start' : last ? '🎯 Target' : 'Via'}</p>
        <h3>{f.t}</h3>
        <p className="meta">{f.y} <LangTag l={f.l} /></p>
      </div>
    </li>
  )
}
