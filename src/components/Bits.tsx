import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { nodeLabel, type Index, type Node } from '../lib/graph'
import { IMG, SCRIPT, initials, langName } from '../lib/format'
import type { Rating } from '../lib/storage'
import { consumeFlyFrom } from './bit-helpers'

/* Line icons (Lucide, ISC licence), drawn inline so they theme with currentColor. */
const ICONS = {
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  back: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  hint: <><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></>,
  timer: <><path d="M10 2h4" /><path d="m12 14 3-3" /><circle cx="12" cy="14" r="8" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  director: <><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" /><path d="m6.2 5.3 3.1 3.9" /><path d="m12.4 3.4 3.1 4" /><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></>,
  music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  actor: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4" /><path d="m15.4 6.5-6.8 4" /></>,
  stats: <><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>,
  calendar: <><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></>,
  archive: <><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></>,
  dice: <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M16 8h.01" /><path d="M8 8h.01" /><path d="M8 16h.01" /><path d="M16 16h.01" /><path d="M12 12h.01" /></>,
  trophy: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>,
  target: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
  film: <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M7 3v18" /><path d="M3 7.5h4" /><path d="M3 12h18" /><path d="M3 16.5h4" /><path d="M17 3v18" /><path d="M17 7.5h4" /><path d="M17 16.5h4" /></>,
  zap: <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />,
  play: <path d="M6 3 20 12 6 21Z" />,
  ticket: <><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" /></>,
  route: <><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></>,
  ban: <><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></>,
  star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />,
  phone: <><rect width="14" height="20" x="5" y="2" rx="2" /><path d="M12 18h.01" /></>,
  laptop: <path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16" />,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>,
  home: <><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  plus: <><path d="M5 12h14" /><path d="M12 5v14" /></>,
  bell: <><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
}
export type IconName = keyof typeof ICONS

export function Icon({ name, size = 18, className = '', label }: { name: IconName; size?: number; className?: string; label?: string }) {
  return (
    <svg
      className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    >
      {ICONS[name]}
    </svg>
  )
}

export function Poster({ idx, id, size = 'md' }: { idx: Index; id: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const f = idx.data.films[id]
  const src = IMG(f.p, size === 'lg' || size === 'xl' ? 'w342' : 'w185')
  return (
    <div className={`poster poster-${size}`} aria-hidden>
      {src ? <img src={src} alt="" loading="lazy" />
        : size === 'sm' ? <Icon name="film" size={14} /> : <span className="poster-title">{f.t}</span>}
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

/** Neutral language chip led by the language's first letter in its own script. */
export const LangTag = ({ l }: { l: string }) => (
  <span className="lang-tag" title={langName(l)}>
    <i aria-hidden>{SCRIPT[l] ?? l.toUpperCase()}</i>{langName(l)}
  </span>
)

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Animate a copy of the tapped picture from its card into its new frame. */
function fly(target: HTMLElement) {
  const from = consumeFlyFrom()
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
  idx, path, activeIndex, goal, replay, label = 'Your chain', shared,
}: {
  idx: Index
  path: Node[]
  activeIndex?: number
  goal?: { par: number; target: string }
  replay?: boolean
  label?: string
  /** `kind:id` keys of frames to mark as common to another chain. */
  shared?: Set<string>
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
    else consumeFlyFrom()
  }, [path.length, replay])

  const last = path[path.length - 1]
  const reached = last.kind === 'film' && last.id === goal?.target
  const ghosts = goal && !reached ? ghostKinds(last, path.filter((n) => n.kind === 'person').length, goal.par) : []

  return (
    <ol className={`strip ${replay ? 'is-replay' : ''}`} ref={listRef} aria-label={label}>
      {path.map((n, i) => (
        <li
          key={`${n.kind}${n.id}${i}`}
          data-i={i}
          className={`frame frame-${n.kind} ${i === activeIndex ? 'is-active' : ''} ${shared?.has(`${n.kind}:${n.id}`) ? 'is-shared' : ''}`}
          style={replay ? ({ '--d': `${i * 160}ms` } as CSSProperties) : undefined}
        >
          <div className="frame-body" title={nodeLabel(idx, n)}>
            <span className="frame-art">
              {n.kind === 'film' ? <Poster idx={idx} id={n.id} size="sm" /> : <Avatar idx={idx} id={n.id} size="sm" />}
            </span>
            <span className="frame-label">{nodeLabel(idx, n)}</span>
          </div>
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
            <span className="frame-label"><Icon name="target" size={11} /> Target</span>
          </span>
        </li>
      )}
    </ol>
  )
}

/** Links used against par as pips: filled within par, amber over it, hollow still to spend. */
export function ParMeter({ links, par, big }: { links: number; par: number; big?: boolean }) {
  const n = Math.max(par, links)
  return (
    <div className={`par-meter ${big ? 'is-big' : ''}`} role="img" aria-label={`${links} links used, shortest is ${par}`}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={`pip ${i < links ? (i < par ? 'is-used' : 'is-over') : ''}`} />
      ))}
      <span className="par-meter-label"><b>{links}</b>/{par}</span>
    </div>
  )
}

/** The box-office verdict, pressed on like a rubber stamp. */
export function Stamp({ rating, small }: { rating: Rating | 'Shelved'; small?: boolean }) {
  return (
    <span className={`stamp t-${rating.toLowerCase()} ${small ? 'is-small' : ''}`}>
      <span>{rating}</span>
    </span>
  )
}

/** Initials disc for players (who have no photos). */
export function PlayerBadge({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return <span className={`player-badge player-${size}`} aria-hidden>{initials(name)}</span>
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Keyboard users: focus moves into the dialog, Tab stays inside it, and closing returns focus to where it was.
    const opener = document.activeElement as HTMLElement | null
    const first = box.current?.querySelector<HTMLElement>('.modal-body ' + FOCUSABLE.split(', ').join(', .modal-body '))
    ;(first ?? box.current)?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key !== 'Tab' || !box.current) return
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return e.preventDefault()
      const at = items.indexOf(document.activeElement as HTMLElement)
      const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : (at === items.length - 1 ? 0 : at + 1)
      e.preventDefault()
      items[next].focus()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [onClose])
  return (
    <div className="scrim" onClick={onClose}>
      <div ref={box} tabIndex={-1} className={`modal ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
