// Electron プリロードスクリプト - 安全なIPC通信
import { contextBridge, ipcRenderer } from 'electron';
import { Scenario, Region, ExecutionState, Action, ExecutionLog, Point } from '../rpa/types';

// レンダラープロセスに公開するAPI
const api = {
  // ========================================
  // シナリオ管理
  // ========================================

  scenario: {
    list: (): Promise<Array<{ id: string; name: string; description?: string; updatedAt: string }>> =>
      ipcRenderer.invoke('scenario:list'),

    load: (scenarioId: string): Promise<Scenario> =>
      ipcRenderer.invoke('scenario:load', scenarioId),

    save: (scenario: Scenario): Promise<boolean> =>
      ipcRenderer.invoke('scenario:save', scenario),

    execute: (scenario: Scenario): Promise<boolean> =>
      ipcRenderer.invoke('scenario:execute', scenario),

    stop: (): Promise<boolean> =>
      ipcRenderer.invoke('scenario:stop'),

    pause: (): Promise<boolean> =>
      ipcRenderer.invoke('scenario:pause'),

    resume: (): Promise<boolean> =>
      ipcRenderer.invoke('scenario:resume'),

    getState: (): Promise<ExecutionState | null> =>
      ipcRenderer.invoke('scenario:getState'),
  },

  // ========================================
  // キャプチャ・画像認識
  // ========================================

  capture: {
    screen: (): Promise<string> =>
      ipcRenderer.invoke('capture:screen'),

    saveTemplate: (name: string, region?: Region): Promise<string> =>
      ipcRenderer.invoke('capture:saveTemplate', name, region),

    saveTemplateFromData: (name: string, base64Data: string, region?: Region): Promise<string> =>
      ipcRenderer.invoke('capture:saveTemplateFromData', name, base64Data, region),

    listTemplates: (): Promise<Array<{ name: string; filename: string; path: string }>> =>
      ipcRenderer.invoke('capture:listTemplates'),

    findImage: (templatePath: string, confidence?: number): Promise<{
      found: boolean;
      confidence: number;
      location: Point;
      region: Region;
    }> =>
      ipcRenderer.invoke('capture:findImage', templatePath, confidence),
  },

  // ========================================
  // 入力
  // ========================================

  input: {
    getMousePosition: (): Promise<Point> =>
      ipcRenderer.invoke('input:getMousePosition'),
  },

  // ========================================
  // ウィンドウ操作
  // ========================================

  window: {
    restore: (): Promise<boolean> =>
      ipcRenderer.invoke('window:restore'),
  },

  // ========================================
  // ダイアログ
  // ========================================

  dialog: {
    openFile: (options: {
      title?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
      defaultPath?: string;
    }): Promise<string | null> =>
      ipcRenderer.invoke('dialog:openFile', options),

    saveFile: (options: {
      title?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
      defaultPath?: string;
    }): Promise<string | null> =>
      ipcRenderer.invoke('dialog:saveFile', options),
  },

  // ========================================
  // イベントリスナー
  // ========================================

  on: {
    executionStateChange: (callback: (state: ExecutionState) => void) => {
      const listener = (_: Electron.IpcRendererEvent, state: ExecutionState) => callback(state);
      ipcRenderer.on('execution:stateChange', listener);
      return () => ipcRenderer.removeListener('execution:stateChange', listener);
    },

    executionStepStart: (callback: (step: Action) => void) => {
      const listener = (_: Electron.IpcRendererEvent, step: Action) => callback(step);
      ipcRenderer.on('execution:stepStart', listener);
      return () => ipcRenderer.removeListener('execution:stepStart', listener);
    },

    executionStepComplete: (callback: (step: Action) => void) => {
      const listener = (_: Electron.IpcRendererEvent, step: Action) => callback(step);
      ipcRenderer.on('execution:stepComplete', listener);
      return () => ipcRenderer.removeListener('execution:stepComplete', listener);
    },

    executionStepError: (callback: (data: { step: Action; error: unknown }) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: { step: Action; error: unknown }) => callback(data);
      ipcRenderer.on('execution:stepError', listener);
      return () => ipcRenderer.removeListener('execution:stepError', listener);
    },

    executionLog: (callback: (log: ExecutionLog) => void) => {
      const listener = (_: Electron.IpcRendererEvent, log: ExecutionLog) => callback(log);
      ipcRenderer.on('execution:log', listener);
      return () => ipcRenderer.removeListener('execution:log', listener);
    },

    executionComplete: (callback: (state: ExecutionState) => void) => {
      const listener = (_: Electron.IpcRendererEvent, state: ExecutionState) => callback(state);
      ipcRenderer.on('execution:complete', listener);
      return () => ipcRenderer.removeListener('execution:complete', listener);
    },
  },
};

// コンテキストブリッジで公開
contextBridge.exposeInMainWorld('rpa', api);

// TypeScript用の型定義
export type RpaApi = typeof api;
