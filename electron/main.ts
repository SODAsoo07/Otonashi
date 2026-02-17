import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { platform } from 'os';

// Windows에서 중복 실행 방지
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
      // CommonJS 환경에서 __dirname은 전역 변수로 제공되므로 직접 사용합니다.
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // 로컬 오디오 파일 로드 및 크로스 도메인 이슈 방지
    },
    show: false,
  });

  win.setMenuBarVisibility(false);

  const isDev = process.env.NODE_ENV === 'development';

  // F12 키로 개발자 도구를 언제든 열 수 있도록 단축키 강제 등록
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win?.webContents.toggleDevTools();
    }
    // 새로고침 단축키 (Ctrl+R) 허용
    if (input.control && input.key.toLowerCase() === 'r' && input.type === 'keyDown') {
      win?.webContents.reload();
    }
  });

  if (isDev) {
    // 개발 모드: Vite 서버 접속
    win.webContents.openDevTools();
    await win.loadURL('http://localhost:5173').catch((err) => {
      console.error("Vite server load failed. Ensure 'npm run dev' is running.", err);
    });
  } else {
    // 빌드 모드: dist 폴더의 index.html 로드
    // tsc로 빌드된 main.js는 dist-electron 폴더에 위치하므로 ..를 통해 상위로 이동 후 dist에 접근합니다.
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    console.log("Loading production index from:", indexPath);
    
    await win.loadFile(indexPath).catch((err) => {
      console.error("Failed to load production index.html:", err);
    });
  }

  win.once('ready-to-show', () => {
    win?.show();
  });

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
