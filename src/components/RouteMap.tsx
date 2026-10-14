import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { nodeLabel, type Index, type Node } from '../lib/graph'
import { Avatar, Icon, Poster } from './Bits'

const key = (n: Node) => `${n.kind}:${n.id}`
// Room each stop needs along the row; a chain longer than the screen scrolls sideways.
const SLOT_W = 62

/**
 * Your chain and the shortest chain drawn as two routes between the same two films.
 * Stops both routes share merge onto the centre line, so you can see where you diverged.
 * A chain too long for the screen scrolls sideways rather than squeezing its stops together.
 */
export default function RouteMap({ idx, mine, best }: { idx: Index; mine: Node[] | null; best: Node[] | null }) {
  const layout = useMemo(() => {
    const same = mine && best && mine.length === best.length && mine.every((n, i) => key(n) === key(best[i]))
    // lane: -1 above the centre line, 0 on it, 1 below.
    const routes = [
      mine && { path: mine, cls: 'mine', lane: best && !same ? -1 : 0 },
      // If your chain is already as short, the other route is an alternative, not a correction.
      best && !same && { path: best, cls: mine && mine.length === best.length ? 'alt' : 'best', lane: mine ? 1 : 0 },
    ].filter(Boolean) as { path: Node[]; cls: string; lane: number }[]

    const counts = new Map<string, number>()
    for (const r of routes) for (const n of new Set(r.path.map(key))) counts.set(n, (counts.get(n) ?? 0) + 1)

    // Positions are slots along the longest route, so a short route stretches to span the same distance.
    const longest = Math.max(...routes.map((r) => r.path.length))
    const slotOf = (i: number, len: number) => ((longest - 1) * i) / Math.max(1, len - 1)
    const spots = new Map<string, { node: Node; slot: number; lane: number; shared: boolean; order: number }>()
    // A loop revisits a stop; each revisit gets its own spot, or it would be averaged on top of its neighbours.
    const spotKeys = routes.map((r) => {
      const seen = new Set<string>()
      return r.path.map((n, i) => (seen.has(key(n)) ? `${key(n)}#${i}` : (seen.add(key(n)), key(n))))
    })
    routes.forEach((r, ri) => {
      r.path.forEach((n, i) => {
        const k = spotKeys[ri][i]
        const shared = k === key(n) && (counts.get(k) ?? 0) > 1
        const prev = spots.get(k)
        const slot = slotOf(i, r.path.length)
        if (prev) prev.slot = (prev.slot + slot) / 2
        else spots.set(k, { node: n, slot, lane: shared ? 0 : r.lane, shared, order: i })
      })
    })
    const edges = routes.flatMap((r, ri) =>
      r.path.slice(1).map((_, i) => ({ a: spotKeys[ri][i], b: spotKeys[ri][i + 1], cls: r.cls, order: i })),
    )
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
  const H = layout.routes.length > 1 ? 190 : 120
  const laneGap = H * 0.24
  // Slot -> pixel along one row; lane shifts a stop above or below the centre line.
  const point = (slot: number, lane: number) => ({
    x: w * (0.04 + (0.92 * slot) / Math.max(1, layout.longest - 1)),
    y: H / 2 + lane * laneGap,
  })
  const at = new Map(layout.spots)

  return (
    <figure className="routemap">
      <div className="routemap-scroll">
        <div className="routemap-canvas" ref={canvasRef} style={{ minWidth: layout.longest * SLOT_W, height: H }}>
          <svg viewBox={`0 0 ${w || 100} ${H}`} aria-hidden>
            {layout.edges.map((e, i) => {
              return (
                <polyline
                  key={i} points={[at.get(e.a)!, at.get(e.b)!].map((s) => point(s.slot, s.lane)).map((p) => `${p.x},${p.y}`).join(' ')}
                  pathLength={e.cls === 'mine' ? 1 : undefined}
                  className={`rm-edge rm-${e.cls}`} style={{ '--d': `${e.order * 140}ms` } as CSSProperties}
                />
              )
            })}
          </svg>
          {w > 0 && [...at].map(([k, s]) => {
            const p = point(s.slot, s.lane)
            return (
            <span
              key={k}
              className={`rm-node rm-${s.node.kind} ${s.shared ? 'is-shared' : ''}`}
              style={{ left: p.x, top: p.y, '--d': `${s.order * 140}ms` } as CSSProperties}
              title={nodeLabel(idx, s.node)}
            >
              {s.node.kind === 'film' ? <Poster idx={idx} id={s.node.id} size="sm" /> : <Avatar idx={idx} id={s.node.id} size="sm" />}
            </span>
            )
          })}
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
