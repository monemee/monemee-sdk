// npm i @monemee/client   ·   main process (Node 20+ / Electron 28+)
import { app, BrowserWindow, ipcMain } from 'electron';
import { createLicense } from '@monemee/client';

const license = createLicense({ productId: 123, appName: 'meine-app', deviceName: process.platform });

ipcMain.handle('license:activate', (_e, key) => license.activate(key));
ipcMain.handle('license:check', () => license.check());
ipcMain.handle('license:deactivate', () => license.deactivate());

app.whenReady().then(async () => {
  const { valid } = await license.check();          // works offline for up to 7 days
  const win = new BrowserWindow({ webPreferences: { preload: new URL('./preload.cjs', import.meta.url).pathname } });
  win.loadFile(valid ? 'pro.html' : 'activate.html');
});
