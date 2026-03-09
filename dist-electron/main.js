"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const os_1 = require("os");
// Prevent multiple instances
if (!electron_1.app.requestSingleInstanceLock()) {
    electron_1.app.quit();
    electron_1.app.exit(0);
}
let win = null;
async function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 768,
        title: 'OTONASHI',
        icon: path_1.default.join(__dirname, '../otonashi.ico'),
        backgroundColor: '#f8f8f6',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
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
    }
    else {
        // 빌드된 파일 구조에 맞춰 경로를 지정합니다.
        await win.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
    win.once('ready-to-show', () => {
        win?.show();
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:'))
            electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.globalShortcut.register('F12', () => {
        if (win) {
            if (win.webContents.isDevToolsOpened()) {
                win.webContents.closeDevTools();
            }
            else {
                win.webContents.openDevTools({ mode: 'detach' });
            }
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if ((0, os_1.platform)() !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('will-quit', () => {
    electron_1.globalShortcut.unregisterAll();
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
