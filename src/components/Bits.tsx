import { useEffect, type ReactNode } from 'react'
import { nodeLabel, type Index, type Node } from '../lib/graph'
import { IMG, initials, langName } from '../lib/format'

export function Poster({ idx, id, size = 'md' }: { idx: Index; id: string; size?: 'sm' | 'md' | 'lg' }) {
  const f = idx.data.films[id]
  const src = IMG(f.p, size === 'lg' ? 'w342' : 'w185')
  return (
    <div className={`poster poster-${size} lang-${f.l}`} aria-hidden>
      {src ? <img src={src} alt="" loading="lazy" /> : <span>{initials(f.t)}</span>}
    </div>
  )
}

export function Avatar({ idx, id, size = 'md' }: { idx: Index; id: string; size?: 'sm' | 'md' }) {
  const p = idx.data.people[id]
  const src = IMG(p.i)
  return (
    <div className={`avatar avatar-${size}`} aria-hidden>
      {src ? <img src={src} alt="" loading="lazy" /> : <span>{initials(p.n)}</span>}
    </div>
  )
}

export const LangTag = ({ l }: { l: string }) => <span className={`lang-tag lang-${l}`}>{langName(l)}</span>

/** Horizontal chain of alternating film / person chips. */
export function Chain({
  idx, path, onJump, activeIndex,
}: { idx: Index; path: Node[]; onJump?: (i: number) => void; activeIndex?: number }) {
  return (
    <ol className="chain">
      {path.map((n, i) => (
        <li key={`${n.kind}${n.id}${i}`} className={`chip chip-${n.kind} ${i === activeIndex ? 'is-active' : ''}`}>
          <button type="button" disabled={!onJump} onClick={() => onJump?.(i)} title={nodeLabel(idx, n)}>
            {n.kind === 'film' ? <Poster idx={idx} id={n.id} size="sm" /> : <Avatar idx={idx} id={n.id} size="sm" />}
            <span className="chip-label">{nodeLabel(idx, n)}</span>
          </button>
        </li>
      ))}
    </ol>
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
