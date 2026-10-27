// Minimal Google Drive v3 client for one binary file in the hidden app data folder.
// Only this app can see that folder; it doesn't show up in the user's Drive.

const FILE_NAME = 'rail-planner-trip.yjs'
const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

export class AuthError extends Error {}

export interface RemoteFile {
  id: string
  /** Increases on every change; used to notice concurrent uploads */
  version: string
}

async function call(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new AuthError('Google sign-in expired')
  if (!res.ok) throw new Error(`Google Drive error ${res.status}`)
  return res
}

export async function findFile(token: string): Promise<RemoteFile | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name = '${FILE_NAME}' and trashed = false`,
    fields: 'files(id,version)',
    orderBy: 'createdTime',
  })
  const res = await call(token, `${API}?${params}`)
  const { files } = (await res.json()) as { files: RemoteFile[] }
  return files[0] ?? null
}

export async function getVersion(token: string, id: string): Promise<string> {
  const res = await call(token, `${API}/${id}?fields=version`)
  return ((await res.json()) as { version: string }).version
}

export async function download(token: string, id: string): Promise<Uint8Array> {
  const res = await call(token, `${API}/${id}?alt=media`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function create(token: string, data: Uint8Array): Promise<RemoteFile> {
  const boundary = 'rail-planner-' + Math.random().toString(36).slice(2)
  const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] })
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    data as BlobPart,
    `\r\n--${boundary}--`,
  ])
  const res = await call(token, `${UPLOAD}?uploadType=multipart&fields=id,version`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return res.json()
}

export async function remove(token: string, id: string): Promise<void> {
  await call(token, `${API}/${id}`, { method: 'DELETE' })
}

export async function update(token: string, id: string, data: Uint8Array): Promise<RemoteFile> {
  const res = await call(token, `${UPLOAD}/${id}?uploadType=media&fields=id,version`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: data as BodyInit,
  })
  return res.json()
}
