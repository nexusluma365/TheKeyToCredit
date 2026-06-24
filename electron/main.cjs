const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dotenv = require('dotenv');

function appendStartupLog(message, detail) {
  try {
    const logDir = path.join(os.homedir(), 'Library', 'Application Support', 'Credit Analyzer USB Key', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const line = [
      new Date().toISOString(),
      message,
      detail ? JSON.stringify(detail) : '',
    ].filter(Boolean).join(' ');
    fs.appendFileSync(path.join(logDir, 'electron-main.log'), `${line}\n`);
  } catch {
    // Logging must never prevent app startup.
  }
}

process.on('uncaughtException', (error) => {
  appendStartupLog('uncaughtException', { message: error.message, stack: error.stack });
});

process.on('unhandledRejection', (error) => {
  appendStartupLog('unhandledRejection', {
    message: error?.message || String(error),
    stack: error?.stack,
  });
});

function findProjectEnv() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(process.resourcesPath || '', '..', '..', '..', '..', '..', '.env'),
  ];

  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function configureLocalEnvironment() {
  const userData = app.getPath('userData');
  const homeConfigPath = path.join(app.getPath('home'), 'Library', 'Application Support', 'Credit Analyzer USB Key', '.env');
  const bundledInstallers = app.isPackaged
    ? path.join(process.resourcesPath, 'installers')
    : path.join(process.cwd(), 'installers');

  process.env.LOCAL_APP_MODE = 'true';
  process.env.SERVER_PORT = process.env.SERVER_PORT || '4001';
  process.env.CLIENT_ORIGIN = 'file://';
  process.env.DB_PATH = process.env.DB_PATH || path.join(userData, 'fulfillment.db');
  process.env.LOGS_DIR = process.env.LOGS_DIR || path.join(userData, 'logs');
  process.env.INSTALLERS_DIR = process.env.INSTALLERS_DIR || bundledInstallers;
  process.env.ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || 'local-electron-session-only';

  const packagedEnvPath = path.join(userData, '.env');
  const envPath = [homeConfigPath, packagedEnvPath, findProjectEnv()].find((candidate) => candidate && fs.existsSync(candidate));
  process.env.LOCAL_KEYGEN_CONFIG_PATH = envPath || packagedEnvPath;

  if (envPath) {
    process.env.DOTENV_CONFIG_PATH = envPath;
    dotenv.config({ path: envPath, override: true });
  }
}

async function startBackend() {
  appendStartupLog('starting backend', { packaged: app.isPackaged, resourcesPath: process.resourcesPath });
  configureLocalEnvironment();
  await import('../server/index.js');
  appendStartupLog('backend started', { port: process.env.SERVER_PORT });
}

function createWindow() {
  appendStartupLog('creating window');
  const win = new BrowserWindow({
    width: 1040,
    height: 740,
    minWidth: 940,
    minHeight: 640,
    title: 'Credit Analyzer USB Key',
    backgroundColor: '#F6F7F9',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  appendStartupLog('window file loaded');
}

app.whenReady().then(async () => {
  try {
    appendStartupLog('app ready');
    await startBackend();
    createWindow();
  } catch (error) {
    appendStartupLog('startup failed', { message: error.message, stack: error.stack });
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
