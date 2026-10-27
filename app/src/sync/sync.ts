import { useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { doc, persistence } from '../store'
import * as drive from './drive'
import { currentToken, forgetToken, isConfigured, requestToken, revoke } from './googleAuth'
import { peekRemote, REMOTE_ORIGIN, syncDoc, type RemoteStore } from './merge'

// Google Drive sync: when to sync, sign-in handling and the status shown in the UI.
// Settings are per device (localStorage), not part of the shared trip.

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'needs-auth' | 'error'

export interface SyncState {
  configured: boolean
  status: SyncStatus
  lastSync: number | null
  error: string
}

const PREFS_KEY = 'rail-planner:sync'
const REPLACE_KEY = 'rail-planner:replace-with-remote'
const CHANGE_DELAY = 4000
const INTERVAL = 2 * 60 * 1000

interface Prefs {
  enabled: boolean
  lastSync: number | null
}

function readPrefs(): Prefs {
  try {
    return { enabled: false, lastSync: null, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return { enabled: false, lastSync: null }
  }
}

function writePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable */
  }
}

let prefs = readPrefs()
let state: SyncState = {
  configured: isConfigured(),
  status: prefs.enabled ? 'idle' : 'off',
  lastSync: prefs.lastSync,
  error: '',
}
const listeners = new Set<() => void>()

function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const useSyncState = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )

const driveStore = (token: string): RemoteStore => ({
  find: () => drive.findFile(token),
  download: (id) => drive.download(token, id),
  version: (id) => drive.getVersion(token, id),
  create: (data) => drive.create(token, data),
  update: (id, data) => drive.update(token, id, data),
})

let running: Promise<void> | null = null
let again = false

/** Sync now. `interactive` = called right after a tap, so a sign-in popup is allowed. */
export async function syncNow(interactive = false): Promise<void> {
  if (!state.configured || !prefs.enabled) return
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      if (!navigator.onLine) {
        set({ status: 'offline' })
        return
      }
      let token = currentToken()
      if (!token && interactive) token = await requestToken(false)
      if (!token) {
        set({ status: 'needs-auth' })
        return
      }
      set({ status: 'syncing', error: '' })
      await syncDoc(doc, driveStore(token))
      prefs = { ...prefs, lastSync: Date.now() }
      writePrefs(prefs)
      set({ status: 'idle', lastSync: prefs.lastSync })
    } catch (e) {
      if (e instanceof drive.AuthError) {
        forgetToken()
        set({ status: 'needs-auth' })
      } else if (!navigator.onLine) {
        set({ status: 'offline' })
      } else {
        set({ status: 'error', error: (e as Error).message })
      }
    }
  })()
  try {
    await running
  } finally {
    running = null
    if (again) {
      again = false
      void syncNow()
    }
  }
}

const hasLocalData = () =>
  ['places', 'people', 'timeline', 'days', 'groups', 'lines', 'expenses'].some((name) => doc.getMap(name).size > 0)

export type ConnectResult = 'connected' | 'choose'
let pendingRemote: Uint8Array | null = null

/**
 * First connection on this device. If both this device and Drive already hold a
 * trip, the user chooses whether to merge them or to use only the Drive copy.
 */
export async function connect(): Promise<ConnectResult> {
  set({ error: '' })
  const token = currentToken() ?? (await requestToken(true))
  const remote = await peekRemote(driveStore(token))
  if (remote && hasLocalData()) {
    pendingRemote = remote
    return 'choose'
  }
  await enable()
  return 'connected'
}

async function enable() {
  prefs = { ...prefs, enabled: true }
  writePrefs(prefs)
  set({ status: 'idle' })
  await syncNow(true)
}

export async function resolveChoice(choice: 'merge' | 'replace' | 'cancel') {
  const remote = pendingRemote
  pendingRemote = null
  if (choice === 'cancel') return
  if (choice === 'merge' || !remote) {
    await enable()
    return
  }
  // Use only the Drive copy: wipe this device's copy, then load the Drive one after a reload
  sessionStorage.setItem(REPLACE_KEY, toBase64(remote))
  prefs = { ...prefs, enabled: true }
  writePrefs(prefs)
  await persistence.clearData()
  location.reload()
}

/** Is this device syncing with Google Drive? */
export const isSyncOn = () => prefs.enabled

/** Wipe this device: trip data, caches of lookups, sync settings. Reloads the app. */
export async function deleteLocalData(): Promise<never> {
  prefs = { enabled: false, lastSync: null }
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('rail-planner:')) localStorage.removeItem(key)
    sessionStorage.clear()
  } catch {
    /* storage unavailable */
  }
  await persistence.clearData()
  location.reload()
  return new Promise<never>(() => {})
}

/** Delete the trip file from Google Drive (asks to sign in if needed), then this device */
export async function deleteEverywhere(): Promise<never> {
  const token = currentToken() ?? (await requestToken(false))
  const file = await drive.findFile(token)
  if (file) await drive.remove(token, file.id)
  await revoke()
  return deleteLocalData()
}

export async function disconnect() {
  prefs = { enabled: false, lastSync: null }
  writePrefs(prefs)
  await revoke()
  set({ status: 'off', lastSync: null, error: '' })
}

/** Called once at startup, after the local data has loaded */
export function startSync() {
  // Finish a "use the Drive copy" switch from before the reload
  const pending = sessionStorage.getItem(REPLACE_KEY)
  if (pending) {
    sessionStorage.removeItem(REPLACE_KEY)
    Y.applyUpdate(doc, fromBase64(pending), REMOTE_ORIGIN)
  }
  if (!state.configured) return

  let timer: ReturnType<typeof setTimeout> | undefined
  doc.on('update', (_update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN || !prefs.enabled) return
    clearTimeout(timer)
    timer = setTimeout(() => void syncNow(), CHANGE_DELAY)
  })
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  setInterval(() => document.visibilityState === 'visible' && void syncNow(), INTERVAL)
  void syncNow()
}

function toBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(b64: string) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}
