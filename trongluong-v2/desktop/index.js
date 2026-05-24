const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simplicity of connection to local sockets in dev, can be secured later
    },
    titleBarStyle: 'hiddenInset', // Sleek native macOS styling if on Mac
    backgroundColor: '#0f172a', // Sleek Slate 900 background to avoid white flash
  })

  // Load the beautiful UI HTML file
  win.loadFile('index.html')

  // Open DevTools in development if needed
  // win.webContents.openDevTools()
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
