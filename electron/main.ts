/**
 * Companion OS — Electron main process
 *
 * On launch:
 *   1. Spawn CompanionClaw on localhost:18789 from bundled dist
 *   2. Open BrowserWindow loading the local app/index.html
 *   3. Pass CompanionClaw URL to renderer via preload
 *   4. System tray with open/quit controls
 *   5. Auto-launch on system start (optional, user-configurable)
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, spawn } from 'child_process';

const CLAW_PORT = 18789;
const CLAW_URL  = `http://localhost:${CLAW_PORT}`;
const IS_DEV    = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let clawProcess: ChildProcess | null = null;

// ─── CompanionClaw launcher ──────────────────────────────────────────────────

function resolveClawEntry(): string | null {
  if (IS_DEV) {
    // Development: look for companionclaw/dist/index.js relative to this repo
    const devPath = path.join(__dirname, '../../companionclaw/dist/index.js');
    if (fs.existsSync(devPath)) return devPath;
    // Try sibling directory
    const siblingPath = path.join(app.getAppPath(), '../companionclaw/dist/index.js');
    if (fs.existsSync(siblingPath)) return siblingPath;
    return null;
  }
  // Production: bundled in extraResources
  return path.join(process.resourcesPath, 'companionclaw/dist/index.js');
}

function spawnCompanionClaw(): void {
  const entry = resolveClawEntry();
  if (!entry) {
    console.warn('[desktop] CompanionClaw entry not found — running in web-only mode');
    return;
  }

  const env = {
    ...process.env,
    PORT: String(CLAW_PORT),
    GATEWAY_PORT: String(CLAW_PORT),
    NODE_ENV: 'production',
    // User data directory: store data in OS app data folder, not next to the binary
    USERS_DIR: path.join(app.getPath('userData'), 'users'),
  };

  clawProcess = spawn(process.execPath, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });

  clawProcess.stdout?.on('data', (d: Buffer) => {
    console.log('[claw]', d.toString().trim());
  });
  clawProcess.stderr?.on('data', (d: Buffer) => {
    console.error('[claw:err]', d.toString().trim());
  });
  clawProcess.on('exit', (code) => {
    console.warn(`[claw] exited with code ${code}`);
    clawProcess = null;
  });

  console.log(`[desktop] CompanionClaw spawned (pid ${clawProcess.pid}) → ${CLAW_URL}`);
}

// ─── Main window ─────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width:  1100,
    height: 780,
    minWidth:  800,
    minHeight: 600,
    title: 'CompanionClaw',
    backgroundColor: '#0a0e1a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../resources/icon.png'),
    show: false, // show after ready-to-show
  });

  // Load the bundled single-page app
  const indexPath = path.join(__dirname, '../app/index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (tray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

// ─── System tray ─────────────────────────────────────────────────────────────

function createTray(): void {
  const iconPath = path.join(__dirname, '../resources/tray-icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('CompanionClaw');

  const menu = Menu.buildFromTemplate([
    { label: 'Open CompanionClaw', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'CompanionClaw running locally', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => { tray = null; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.handle('get-claw-url', () => CLAW_URL);

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('open-external', (_e, url: string) => {
  shell.openExternal(url);
});

ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  spawnCompanionClaw();
  createWindow();
  createTray();

  // Auto-updater (production only)
  if (!IS_DEV) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  // On macOS keep app running in tray; on other platforms quit
  if (process.platform !== 'darwin') {
    // Keep running in tray — don't quit
  }
});

app.on('will-quit', () => {
  // Kill CompanionClaw when app exits
  if (clawProcess && !clawProcess.killed) {
    clawProcess.kill('SIGTERM');
  }
});

// Security: prevent navigation to external URLs
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });
});
