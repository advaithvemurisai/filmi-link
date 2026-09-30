import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { nodeLabel, type Index, type Node, type Role } from '../lib/graph'
import { IMG, initials, langName } from '../lib/format'

export const ROLE_ICON: Record<Role, string> = { Director: '🎬', Music: '🎵', Actor: '🎭' }

export function Poster({ idx, id, size = 'md' }: { idx: Index; id: string; size?: 'sm' | 'md' | 'lg' }) {
  const f = idx.data.films[id]
  const src = IMG(f.p, size === 'lg' ? 'w342' : 'w185')
  return (
    <div className={`poster poster-${size} lang-${f.l}`} aria-hidden>
      {src ? <img src={src} alt="" loading="lazy" /> : <span>{initials(f.t)}</span>}
    </div>
  )
}

export function Avatar({ idx, id, size = 'md' }: { idx: Index; id: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const p = idx.data.people[id]
  const src = IMG(p.i)
  return (
    <div className={`avatar avatar-${size}`} aria-hidden>
      {src ? <img src={src} alt="" loading="lazy" /> : <span>{initials(p.n)}</span>}
    </div>
  )
}

export const LangTag = ({ l }: { l: string }) => <span className={`lang-tag lang-${l}`}>{langName(l)}</span>

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Where the last-tapped card's picture was, so the filmstrip can fly the new frame in from it. */
let flyFrom: { rect: DOMRect; el: HTMLElement } | null = null
export function launchFrom(el: Element | null) {
  flyFrom = el instanceof HTMLElement ? { rect: el.getBoundingClientRect(), el } : null
}

/** Animate a copy of the tapped picture from its card into its new frame. */
function fly(target: HTMLElement) {
  const from = flyFrom
  flyFrom = null
  if (!from || reduceMotion()) return
  const to = target.getBoundingClientRect()
  const ghost = from.el.cloneNode(true) as HTMLElement
  Object.assign(ghost.style, {
    position: 'fixed', left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`,
    margin: '0', zIndex: '50', pointerEvents: 'none', transformOrigin: 'top left',
  })
  ghost.classList.add('fly-ghost')
  document.body.appendChild(ghost)
  target.style.visibility = 'hidden'
  const dx = from.rect.left - to.left
  const dy = from.rect.top - to.top
  const a = ghost.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${from.rect.width / to.width}, ${from.rect.height / to.height})` },
      { transform: 'translate(0, 0) scale(1)' },
    ],
    { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' },
  )
  const done = () => { ghost.remove(); target.style.visibility = '' }
  a.onfinish = done
  a.oncancel = done
}

/** Film / person kinds still needed after `current` to reach the target at par. */
function ghostKinds(current: Node, links: number, par: number): Node['kind'][] {
  const people = Math.max(0, par - links)
  const out: Node['kind'][] = []
  if (current.kind === 'film') for (let i = 0; i < people; i++) out.push(...(i ? ['film', 'person'] as const : ['person'] as const))
  else for (let i = 0; i < people; i++) out.push('film', 'person')
  return out
}

/**
 * The chain as a strip of film frames. In play it also shows the empty frames still to fill at par,
 * ending on the target, so progress reads at a glance.
 */
export function Filmstrip({
  idx, path, onJump, activeIndex, goal, replay,
}: {
  idx: Index
  path: Node[]
  onJump?: (i: number) => void
  activeIndex?: number
  goal?: { par: number; target: string }
  replay?: boolean
}) {
  const listRef = useRef<HTMLOListElement>(null)
  const prevLen = useRef(path.length)

  useLayoutEffect(() => {
    const list = listRef.current
    const grew = path.length > prevLen.current
    prevLen.current = path.length
    if (!list) return
    const li = list.querySelector<HTMLElement>(`[data-i="${path.length - 1}"]`)
    if (li && !replay) list.scrollLeft = li.offsetLeft - list.clientWidth / 2 + li.offsetWidth / 2
    const art = li?.querySelector<HTMLElement>('.frame-art')
    if (grew && art) fly(art)
    else flyFrom = null
  }, [path.length, replay])

  const last = path[path.length - 1]
  const reached = last.kind === 'film' && last.id === goal?.target
  const ghosts = goal && !reached ? ghostKinds(last, path.filter((n) => n.kind === 'person').length, goal.par) : []

  return (
    <ol className={`strip ${replay ? 'is-replay' : ''}`} ref={listRef} aria-label="Your chain">
      {path.map((n, i) => (
        <li
          key={`${n.kind}${n.id}${i}`}
          data-i={i}
          className={`frame frame-${n.kind} ${i === activeIndex ? 'is-active' : ''}`}
          style={replay ? ({ '--d': `${i * 160}ms` } as CSSProperties) : undefined}
        >
          <button type="button" className="frame-body" disabled={!onJump || i === activeIndex} onClick={() => onJump?.(i)} title={nodeLabel(idx, n)}>
            <span className="frame-art">
              {n.kind === 'film' ? <Poster idx={idx} id={n.id} size="sm" /> : <Avatar idx={idx} id={n.id} size="sm" />}
            </span>
            <span className="frame-label">{nodeLabel(idx, n)}</span>
          </button>
        </li>
      ))}
      {ghosts.map((k, j) => (
        <li key={`g${j}`} className={`frame frame-${k} is-ghost`} aria-hidden>
          <span className="frame-body"><span className="frame-art" /></span>
        </li>
      ))}
      {goal && !reached && (
        <li className={`frame frame-film is-goal ${ghosts.length ? '' : 'is-over'}`} title={`Target: ${idx.data.films[goal.target].t}`}>
          <span className="frame-body">
            <span className="frame-art"><Poster idx={idx} id={goal.target} size="sm" /></span>
            <span className="frame-label">🎯 Target</span>
          </span>
        </li>
      )}
    </ol>
  )
}

/** Links used against par as pips: green within par, orange over it, hollow still to spend. */
export function ParMeter({ links, par, big }: { links: number; par: number; big?: boolean }) {
  const n = Math.max(par, links)
  return (
    <div className={`par-meter ${big ? 'is-big' : ''}`} role="img" aria-label={`${links} links used, par ${par}`}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={`pip ${i < links ? (i < par ? 'is-used' : 'is-over') : ''}`} />
      ))}
      <span className="par-meter-label"><b>{links}</b>/{par}</span>
    </div>
  )
}

/** Initials disc with a stable colour per name, for players (who have no photos). */
export function PlayerBadge({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  let h = 0
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360
  return (
    <span className={`player-badge player-${size}`} style={{ '--h': h } as CSSProperties} aria-hidden>
      {initials(name)}
    </span>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
