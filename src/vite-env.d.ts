/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public half of the Web Push VAPID key pair; reminders stay hidden without it. */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}
