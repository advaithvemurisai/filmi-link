import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { nodeLabel, type Index, type Node } from '../lib/graph'
import { Avatar, Icon, Poster } from './Bits'

const key = (n: Node) => `${n.kind}:${n.id}`
// Closest two stops may sit, centre to centre, before a long chain wraps onto another row.
const MIN_GAP = 48

/**
 * Your chain and the shortest chain drawn as two routes between the same two films.
 * Stops both routes share merge onto the centre line, so you can see where you diverged.
 * A chain too long for one row snakes back and forth, so the map never scrolls sideways.
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
    const spots = new Map<string, { node: Node; slot: number; onLongest?: number; lane: number; shared: boolean; order: number }>()
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
        const onLongest = r.path.length === longest ? slot : undefined
        if (prev) {
          prev.slot = (prev.slot + slot) / 2
          prev.onLongest ??= onLongest
        } else spots.set(k, { node: n, slot, onLongest, lane: shared ? 0 : r.lane, shared, order: i })
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
  const two = layout.routes.length > 1
  const perRow = Math.max(2, Math.floor((0.92 * w) / MIN_GAP) + 1)
  const wrapped = w > 0 && layout.longest > perRow
  const cols = wrapped ? perRow : layout.longest
  const rows = wrapped ? Math.ceil(layout.longest / perRow) : 1
  // Wrapped rows pack tighter than a lone row, which has the room to breathe.
  const rowH = wrapped ? (two ? 150 : 84) : two ? 190 : 120
  const laneGap = wrapped ? 40 : rowH * 0.24
  const H = rows * rowH
  // A shared stop sits midway between its places on the two routes, but once wrapped, midway can be
  // rows away from both; there it keeps its place on the longer route, which sets the grid.
  const at = new Map(layout.spots.map(([k, s]) => [k, wrapped ? { ...s, slot: s.onLongest ?? s.slot } : s]))

  // Slot -> pixel along a serpentine: each row runs the opposite way to the one above,
  // and the stretch between a row's last slot and the next row's first is the vertical turn.
  const colX = (c: number) => w * (0.04 + (0.92 * c) / Math.max(1, cols - 1))
  const point = (slot: number, lane: number) => {
    const r = Math.min(rows - 1, Math.floor(slot / cols))
    const c = slot - r * cols
    const flip = (row: number) => (row % 2 ? cols - 1 - Math.min(c, cols - 1) : Math.min(c, cols - 1))
    const y0 = r * rowH + rowH / 2 + lane * laneGap
    if (c <= cols - 1 || r === rows - 1) return { x: colX(flip(r)), y: y0 }
    return { x: colX(flip(r)), y: y0 + (c - (cols - 1)) * rowH }
  }
  // An edge follows the serpentine through every turn it crosses, easing between its two stops' lanes.
  const edgePoints = (a: { slot: number; lane: number }, b: { slot: number; lane: number }) => {
    const lane = (s: number) => a.lane + ((b.lane - a.lane) * (s - a.slot)) / (b.slot - a.slot || 1)
    const stops = [a.slot]
    for (let r = Math.floor(a.slot / cols); r < rows - 1; r++) {
      for (const s of [r * cols + cols - 1, (r + 1) * cols]) if (s > a.slot && s < b.slot) stops.push(s)
    }
    stops.push(b.slot)
    return stops.map((s) => point(s, lane(s))).map((p) => `${p.x},${p.y}`).join(' ')
  }

  return (
    <figure className="routemap">
      <div className="routemap-scroll">
        <div className="routemap-canvas" ref={canvasRef} style={{ height: H }}>
          <svg viewBox={`0 0 ${w || 100} ${H}`} aria-hidden>
            {layout.edges.map((e, i) => {
              return (
                <polyline
                  key={i} points={edgePoints(at.get(e.a)!, at.get(e.b)!)}
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
