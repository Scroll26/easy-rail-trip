import * as Y from 'yjs'

// One sync round between the local Yjs document and a remote copy.
// Yjs documents merge without conflicts: every device's edits survive, so the
// remote copy only ever grows towards the union of all devices.

export const REMOTE_ORIGIN = 'remote-sync'

export interface RemoteFile {
  id: string
  version: string
}

/** Where the shared copy lives (Google Drive in the app, a fake in tests) */
export interface RemoteStore {
  find(): Promise<RemoteFile | null>
  download(id: string): Promise<Uint8Array>
  version(id: string): Promise<string>
  create(data: Uint8Array): Promise<RemoteFile>
  update(id: string, data: Uint8Array): Promise<RemoteFile>
}

export type SyncResult = 'uploaded' | 'unchanged'

/**
 * Download → merge into the local doc → upload the union if the remote lacks anything.
 * If another device uploaded in between, start over so its changes are merged too.
 */
export async function syncDoc(doc: Y.Doc, store: RemoteStore, attempts = 3): Promise<SyncResult> {
  for (let i = 0; i < attempts; i++) {
    const file = await store.find()
    let remote: Y.Doc | null = null
    if (file) {
      const bytes = await store.download(file.id)
      Y.applyUpdate(doc, bytes, REMOTE_ORIGIN)
      remote = new Y.Doc()
      Y.applyUpdate(remote, bytes)
    }
    // Same items and same deletions on both sides: nothing to upload
    if (remote && Y.equalSnapshots(Y.snapshot(doc), Y.snapshot(remote))) return 'unchanged'

    const data = Y.encodeStateAsUpdate(doc)
    if (!file) {
      await store.create(data)
      return 'uploaded'
    }
    if ((await store.version(file.id)) !== file.version) continue
    await store.update(file.id, data)
    return 'uploaded'
  }
  throw new Error('The Drive copy kept changing. Try again in a moment.')
}

/** Read the remote copy without changing anything (for the first-connect choice) */
export async function peekRemote(store: RemoteStore): Promise<Uint8Array | null> {
  const file = await store.find()
  return file ? store.download(file.id) : null
}
