/**
 * Preload script — exposes safe IPC APIs to the renderer (app/index.html).
 * contextBridge ensures only whitelisted APIs cross the context boundary.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  /** URL of the local CompanionClaw server */
  getClawUrl: (): Promise<string> => ipcRenderer.invoke('get-claw-url'),

  /** App version string */
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  /** Open a URL in the system browser */
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),

  /** Path to the user data directory (where companion workspaces are stored) */
  getUserDataPath: (): Promise<string> => ipcRenderer.invoke('get-user-data-path'),
});

// Type declaration for TypeScript in renderer (referenced by app/app.js)
declare global {
  interface Window {
    electron: {
      getClawUrl: () => Promise<string>;
      getAppVersion: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      getUserDataPath: () => Promise<string>;
    };
  }
}
