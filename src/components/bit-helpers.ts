import type { Role } from '../lib/graph'
import type { IconName } from './Bits'

export const ROLE_ICON: Record<Role, IconName> = { Director: 'director', Music: 'music', Actor: 'actor' }

/** Where the last-tapped card's picture was, so the filmstrip can fly the new frame in from it. */
export let flyFrom: { rect: DOMRect; el: HTMLElement } | null = null

export function launchFrom(el: Element | null) {
  flyFrom = el instanceof HTMLElement ? { rect: el.getBoundingClientRect(), el } : null
}

export function consumeFlyFrom() {
  const from = flyFrom
  flyFrom = null
  return from
}
