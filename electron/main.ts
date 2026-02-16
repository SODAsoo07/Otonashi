import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit();
  app.exit(0);
}

let win: BrowserWindow | null = null;

async function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'OTONASHI',
    backgroundColor: '#f8f8f6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true, // Allow loading local resources if needed
    },
    show: false, // Wait until ready-to-show to prevent flickering
  });

  win.setMenuBarVisibility(false); // Hide default menu bar

  // Check if we are running in development mode
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    // In dev, load from the Vite dev server
    await win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    // In production, load the built html file
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => {
    win?.show();
  });

  // Open external links in default browser, not Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (platform() !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});