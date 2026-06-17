import { join } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { clearCredentials, loadCredentials, saveCredentials } from './credentials'
import type { Credentials } from './credentials'
import { listSelections } from './ddb'
import { moveSelectedImages } from './mover'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#ffffff',
    title: 'Selection Move',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  }
  else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function registerIpc(): void {
  ipcMain.handle('creds:get', async () => {
    const c = await loadCredentials()
    if (!c) return null
    return { region: c.region, tableName: c.tableName, hasKeys: true }
  })

  ipcMain.handle('creds:set', async (_e, creds: Credentials) => {
    await saveCredentials(creds)
    return true
  })

  ipcMain.handle('creds:clear', async () => {
    await clearCredentials()
    return true
  })

  ipcMain.handle('selections:list', async () => {
    const creds = await loadCredentials()
    if (!creds) throw new Error('Credentials not set')
    return await listSelections(creds)
  })

  ipcMain.handle('folder:pick', async () => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Choose folder with original photos',
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  ipcMain.handle('move:start', async (event, payload: { folder: string, imageNames: string[] }) => {
    const sender = event.sender
    return await moveSelectedImages(payload.folder, payload.imageNames, (progress) => {
      sender.send('move:progress', progress)
    })
  })
}
