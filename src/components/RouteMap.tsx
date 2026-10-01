import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { nodeLabel, type Index, type Node } from '../lib/graph'
import { Avatar, Icon, Poster } from './Bits'

const key = (n: Node) => `${n.kind}:${n.id}`
const H = 170

/**
 * Your chain and the shortest chain drawn as two routes between the same two films.
 * Stops both routes share merge onto the centre line, so you can see where you diverged.
 */
export default function RouteMap({ idx, mine, best }: { idx: Index; mine: Node[] | null; best: Node[] | null }) {
  const layout = useMemo(() => {
    const same = mine && best && mine.length === best.length && mine.every((n, i) => key(n) === key(best[i]))
    const routes = [
      mine && { path: mine, cls: 'mine', y: best && !same ? 26 : 50 },
      // If your chain is already as short, the other route is an alternative, not a correction.
      best && !same && { path: best, cls: mine && mine.length === best.length ? 'alt' : 'best', y: mine ? 74 : 50 },
    ].filter(Boolean) as { path: Node[]; cls: string; y: number }[]

    const counts = new Map<string, number>()
    for (const r of routes) for (const n of new Set(r.path.map(key))) counts.set(n, (counts.get(n) ?? 0) + 1)

    const spots = new Map<string, { node: Node; x: number; y: number; shared: boolean; order: number }>()
    const xOf = (i: number, len: number) => 4 + (92 * i) / Math.max(1, len - 1)
    for (const r of routes) {
      r.path.forEach((n, i) => {
        const k = key(n)
        const shared = (counts.get(k) ?? 0) > 1
        const prev = spots.get(k)
        const x = xOf(i, r.path.length)
        if (prev) prev.x = (prev.x + x) / 2
        else spots.set(k, { node: n, x, y: shared ? 50 : r.y, shared, order: i })
      })
    }
    const edges = routes.flatMap((r) =>
      r.path.slice(1).map((n, i) => ({ a: key(r.path[i]), b: key(n), cls: r.cls, order: i })),
    )
    const longest = Math.max(...routes.map((r) => r.path.length))
    return { spots: [...spots.entries()], edges, routes, longest }
  }, [mine, best])

  // Draw in pixels (not a stretched viewBox) so strokes and the draw-on animation stay true.
  const canvasRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  if (!layout.routes.length) return null
  const at = new Map(layout.spots)

  return (
    <figure className="routemap">
      <div className="routemap-scroll">
        <div className="routemap-canvas" ref={canvasRef} style={{ minWidth: `${layout.longest * 46}px` }}>
          <svg viewBox={`0 0 ${w || 100} ${H}`} aria-hidden>
            {layout.edges.map((e, i) => {
              const a = at.get(e.a)!, b = at.get(e.b)!
              return (
                <line
                  key={i} x1={(a.x * w) / 100} y1={(a.y * H) / 100} x2={(b.x * w) / 100} y2={(b.y * H) / 100}
                  pathLength={e.cls === 'mine' ? 1 : undefined}
                  className={`rm-edge rm-${e.cls}`} style={{ '--d': `${e.order * 140}ms` } as CSSProperties}
                />
              )
            })}
          </svg>
          {layout.spots.map(([k, s]) => (
            <span
              key={k}
              className={`rm-node rm-${s.node.kind} ${s.shared ? 'is-shared' : ''}`}
              style={{ left: `${s.x}%`, top: `${s.y}%`, '--d': `${s.order * 140}ms` } as CSSProperties}
              title={nodeLabel(idx, s.node)}
            >
              {s.node.kind === 'film' ? <Poster idx={idx} id={s.node.id} size="sm" /> : <Avatar idx={idx} id={s.node.id} size="sm" />}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="routemap-key">
        {mine && best && mine.length === best.length
          ? <span><i className="key-mine" /> <Icon name="check" size={13} /> Your chain, a shortest chain</span>
          : mine && <span><i className="key-mine" /> Your chain</span>}
        {layout.routes.some((r) => r.cls === 'best') && <span><i className="key-best" /> Shortest chain</span>}
        {layout.routes.some((r) => r.cls === 'alt') && <span><i className="key-alt" /> Another shortest chain</span>}
      </figcaption>
    </figure>
  )
}
