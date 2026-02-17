import { app, BrowserWindow, shell, globalShortcut } from 'electron';
import path from 'path';
import { platform } from 'os';

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
      // CommonJS 환경이므로 __dirname을 직접 사용할 수 있습니다.
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
    show: false,
  });

  win.setMenuBarVisibility(false);

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    await win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    // 빌드된 파일 구조에 맞춰 경로를 지정합니다.
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    win.webContents.openDevTools({ mode: 'detach' }); 
  }

  win.once('ready-to-show', () => {
    win?.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  
  globalShortcut.register('F12', () => {
    if (win) {
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools();
      } else {
        win.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (platform() !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});