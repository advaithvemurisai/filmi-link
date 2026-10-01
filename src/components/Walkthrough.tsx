import { useMemo, useState } from 'react'
import { Avatar, Filmstrip, Icon, Poster, Stamp } from './Bits'
import { nodeLabel, randomPuzzle, shortestPath, type Index, type Node } from '../lib/graph'

/**
 * A 20-second guided chain: tap through a real 2-link puzzle, with two decoys at each step.
 * Used in the how-to dialog and inline on the landing page.
 */
export default function Walkthrough({ idx, doneLabel, onDone }: { idx: Index; doneLabel: string; onDone: () => void }) {
  const example = useMemo(() => {
    let seed = 42
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const p = randomPuzzle(idx, 2, rng)
    return p && p.par === 2 ? shortestPath(idx, { kind: 'film', id: p.s }, p.e) : null
  }, [idx])
  const [step, setStep] = useState(0)
  const [wrong, setWrong] = useState<string | null>(null)

  const options = useMemo(() => {
    if (!example || step >= example.length - 1) return []
    const cur = example[step]
    const next = example[step + 1]
    const pool: Node[] = cur.kind === 'film'
      ? (idx.filmCredits[cur.id] ?? []).map((c) => ({ kind: 'person', id: c.id }))
      : (idx.personFilms[cur.id] ?? []).map((c) => ({ kind: 'film', id: c.id }))
    const decoys = [...new Map(pool.filter((n) => n.id !== next.id).map((n) => [n.id, n])).values()].slice(0, 2)
    // Stable shuffle so the right answer isn't always first.
    return [next, ...decoys].map((n, i) => ({ n, k: (i * 7 + step * 3) % 5 })).sort((a, b) => a.k - b.k).map((o) => o.n)
  }, [example, step, idx])

  if (!example) return null
  const done = step >= example.length - 1
  const cur = example[step]
  const target = example[example.length - 1]
  const coach = done
    ? 'That’s a 2-link chain, the shortest possible: a Blockbuster. Every daily works like this.'
    : step === 0
      ? <>You start at <b>{nodeLabel(idx, cur)}</b>. Tap someone who worked on it.</>
      : cur.kind === 'person'
        ? <>Now pick one of <b>{nodeLabel(idx, cur)}</b>’s films.</>
        : <>From <b>{nodeLabel(idx, cur)}</b>, who also worked on <b>{nodeLabel(idx, target)}</b>?</>

  return (
    <div className="walk">
      <p className="tut-goal">
        Link <b>{nodeLabel(idx, example[0])}</b> to <b>{nodeLabel(idx, target)}</b> through the people who made them.
      </p>
      <Filmstrip idx={idx} path={example.slice(0, step + 1)} goal={{ par: 2, target: target.id }} label="Example chain" />
      <p className={`tut-coach ${wrong ? 'is-wrong' : ''}`} role="status">
        {wrong ? 'That one works in the full game, but it isn’t on the shortest route. Try another.' : coach}
      </p>
      {done ? (
        <div className="tut-done">
          <Stamp rating="Blockbuster" />
          <button className="btn primary lg" onClick={onDone}>{doneLabel} <Icon name="arrow" size={16} /></button>
        </div>
      ) : (
        <div className="tut-options">
          {options.map((n) => (
            <button
              key={n.kind + n.id}
              className={`tut-option ${wrong === n.id ? 'is-wrong' : ''}`}
              onClick={() => {
                if (n.id === example[step + 1].id) {
                  setWrong(null)
                  setStep(step + 1)
                } else setWrong(n.id)
              }}
            >
              {n.kind === 'film' ? <Poster idx={idx} id={n.id} size="md" /> : <Avatar idx={idx} id={n.id} size="lg" />}
              <span>{nodeLabel(idx, n)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
