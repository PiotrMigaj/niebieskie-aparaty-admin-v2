import { contextBridge, ipcRenderer } from 'electron'

export interface CredentialsInput {
  accessKeyId: string
  secretAccessKey: string
  region: string
  tableName: string
}

export interface CredentialsStatus {
  region: string
  tableName: string
  hasKeys: true
}

export interface SelectionView {
  selectionId: string
  eventId: string
  username: string
  eventTitle: string
  blocked: boolean
  maxNumberOfPhotos: number
  selectedNumberOfPhotos: number
  selectedImages: string[]
  createdAt: string
  updatedAt: string
}

export interface ProgressEvent {
  done: number
  total: number
  currentFilename: string
}

export type MoveOutcome = 'moved' | 'missing' | 'already_existed' | 'errored'

export interface MoveEntry {
  imageName: string
  outcome: MoveOutcome
  error?: string
}

export interface MoveSummary {
  total: number
  moved: number
  missing: number
  already_existed: number
  errored: number
  entries: MoveEntry[]
  destination: string
}

const api = {
  getCredsStatus: (): Promise<CredentialsStatus | null> => ipcRenderer.invoke('creds:get'),
  setCreds: (creds: CredentialsInput): Promise<boolean> => ipcRenderer.invoke('creds:set', creds),
  clearCreds: (): Promise<boolean> => ipcRenderer.invoke('creds:clear'),
  listSelections: (): Promise<SelectionView[]> => ipcRenderer.invoke('selections:list'),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('folder:pick'),
  startMove: (folder: string, imageNames: string[]): Promise<MoveSummary> =>
    ipcRenderer.invoke('move:start', { folder, imageNames }),
  onProgress: (cb: (e: ProgressEvent) => void): (() => void) => {
    const listener = (_: unknown, e: ProgressEvent): void => cb(e)
    ipcRenderer.on('move:progress', listener)
    return () => ipcRenderer.off('move:progress', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
declare global {
  interface Window { api: Api }
}
