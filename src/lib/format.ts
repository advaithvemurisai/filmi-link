export const LANGS: Record<string, string> = {
  hi: 'Hindi', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', mr: 'Marathi', bn: 'Bengali',
  pa: 'Punjabi', gu: 'Gujarati', or: 'Odia', as: 'Assamese', en: 'English',
}
export const langName = (l: string) => LANGS[l] ?? l.toUpperCase()

export const IMG = (path: string | null, size = 'w185') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null)

export function clock(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export const initials = (name: string) =>
  name.split(/[\s.–-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
