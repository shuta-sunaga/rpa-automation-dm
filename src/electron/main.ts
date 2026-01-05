// Electron メインプロセス
import { app, BrowserWindow, ipcMain, dialog, screen, desktopCapturer } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { ScenarioExecutor } from '../rpa/scenario-executor';
import { Scenario, Action, Region } from '../rpa/types';

let mainWindow: BrowserWindow | null = null;
let scenarioExecutor: ScenarioExecutor | null = null;

const isDev = process.env.NODE_ENV === 'development';

// 多重起動防止
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 2つ目のインスタンスが起動しようとした場合、既存のウィンドウにフォーカス
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
    icon: join(__dirname, '../../assets/icon.ico'),
    title: 'Image RPA Studio',
  });

  // レンダラーをロード
  if (isDev) {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // シナリオ実行エンジン初期化
  const baseDir = app.isPackaged
    ? join(process.resourcesPath, '..')
    : join(__dirname, '../../');

  scenarioExecutor = new ScenarioExecutor(baseDir);

  // イベントリスナー設定
  setupExecutorEvents();
}

function setupExecutorEvents(): void {
  if (!scenarioExecutor) return;

  scenarioExecutor.on('stateChange', (state) => {
    mainWindow?.webContents.send('execution:stateChange', state);
  });

  scenarioExecutor.on('stepStart', (step) => {
    mainWindow?.webContents.send('execution:stepStart', step);
  });

  scenarioExecutor.on('stepComplete', (step) => {
    mainWindow?.webContents.send('execution:stepComplete', step);
  });

  scenarioExecutor.on('stepError', (data) => {
    mainWindow?.webContents.send('execution:stepError', data);
  });

  scenarioExecutor.on('log', (log) => {
    mainWindow?.webContents.send('execution:log', log);
  });

  scenarioExecutor.on('complete', (state) => {
    mainWindow?.webContents.send('execution:complete', state);
  });
}

// ========================================
// IPC ハンドラー
// ========================================

// シナリオ一覧取得
ipcMain.handle('scenario:list', async () => {
  const scenariosDir = app.isPackaged
    ? join(process.resourcesPath, 'scenarios')
    : join(__dirname, '../../scenarios');

  if (!existsSync(scenariosDir)) {
    return [];
  }

  const files = readdirSync(scenariosDir).filter(f => f.endsWith('.json'));
  const scenarios = files.map(file => {
    try {
      const content = readFileSync(join(scenariosDir, file), 'utf-8');
      const scenario = JSON.parse(content) as Scenario;
      return {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        updatedAt: scenario.updatedAt,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  return scenarios;
});

// シナリオ読み込み
ipcMain.handle('scenario:load', async (_, scenarioId: string) => {
  const scenariosDir = app.isPackaged
    ? join(process.resourcesPath, 'scenarios')
    : join(__dirname, '../../scenarios');

  const filepath = join(scenariosDir, `${scenarioId}.json`);
  if (!existsSync(filepath)) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  const content = readFileSync(filepath, 'utf-8');
  return JSON.parse(content) as Scenario;
});

// シナリオ保存
ipcMain.handle('scenario:save', async (_, scenario: Scenario) => {
  const scenariosDir = app.isPackaged
    ? join(process.resourcesPath, 'scenarios')
    : join(__dirname, '../../scenarios');

  const filepath = join(scenariosDir, `${scenario.id}.json`);
  scenario.updatedAt = new Date().toISOString();
  writeFileSync(filepath, JSON.stringify(scenario, null, 2), 'utf-8');
  return true;
});

// シナリオ実行
ipcMain.handle('scenario:execute', async (_, scenario: Scenario) => {
  if (!scenarioExecutor) {
    throw new Error('Executor not initialized');
  }

  // 実行前にウィンドウを最小化
  if (mainWindow) {
    mainWindow.minimize();
    // 最小化が完了するまで少し待機
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  scenarioExecutor.loadScenario(scenario);
  // 非同期で実行開始
  scenarioExecutor.execute().catch(console.error);
  return true;
});

// ウィンドウを復元
ipcMain.handle('window:restore', async () => {
  if (mainWindow) {
    mainWindow.restore();
    mainWindow.focus();
  }
  return true;
});

// 実行停止
ipcMain.handle('scenario:stop', async () => {
  scenarioExecutor?.stop();
  return true;
});

// 実行一時停止
ipcMain.handle('scenario:pause', async () => {
  scenarioExecutor?.pause();
  return true;
});

// 実行再開
ipcMain.handle('scenario:resume', async () => {
  scenarioExecutor?.resume();
  return true;
});

// 実行状態取得
ipcMain.handle('scenario:getState', async () => {
  return scenarioExecutor?.getState() ?? null;
});

// 画面キャプチャ (外部PowerShellスクリプト使用)
ipcMain.handle('capture:screen', async () => {
  const { execSync } = require('child_process');
  const { tmpdir } = require('os');

  try {
    // アプリウィンドウを一時的に隠す
    if (mainWindow) {
      mainWindow.hide();
      // ウィンドウが完全に隠れるまで待機
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const tempFile = join(tmpdir(), `screenshot-capture-${Date.now()}.png`);
    const scriptPath = app.isPackaged
      ? join(process.resourcesPath, 'scripts', 'capture-screen.ps1')
      : join(__dirname, '../../scripts/capture-screen.ps1');

    console.log('Capture: Script path:', scriptPath);
    console.log('Capture: Output file:', tempFile);

    const command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -OutputPath "${tempFile}"`;
    console.log('Capture: Command:', command);

    const result = execSync(command, {
      encoding: 'utf8',
      timeout: 15000
    });
    console.log('Capture: PowerShell result:', result.trim());

    // アプリウィンドウを再表示
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }

    if (!existsSync(tempFile)) {
      throw new Error('Screenshot file was not created');
    }

    const buffer = readFileSync(tempFile);
    console.log('Capture: File size:', buffer.length, 'bytes');

    // Clean up temp file
    try {
      const { unlinkSync } = require('fs');
      unlinkSync(tempFile);
    } catch (e) {
      // ignore cleanup errors
    }

    const base64 = buffer.toString('base64');
    console.log('Capture: Base64 length:', base64.length);
    return base64;
  } catch (error: any) {
    // エラー時もウィンドウを再表示
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
    console.error('Screen capture error:', error);
    throw new Error(`Screen capture failed: ${error.message || error}`);
  }
});

// テンプレート画像保存
ipcMain.handle('capture:saveTemplate', async (_, name: string, region?: Region) => {
  const Jimp = require('jimp');
  const { execSync } = require('child_process');
  const { tmpdir } = require('os');

  const tempFile = join(tmpdir(), `screenshot-save-${Date.now()}.png`);
  const scriptPath = app.isPackaged
    ? join(process.resourcesPath, 'scripts', 'capture-screen.ps1')
    : join(__dirname, '../../scripts/capture-screen.ps1');

  execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}" -OutputPath "${tempFile}"`, {
    encoding: 'utf8',
    timeout: 10000
  });

  const buffer = readFileSync(tempFile);
  const { unlinkSync } = require('fs');
  try { unlinkSync(tempFile); } catch (e) { /* ignore */ }

  const templatesDir = app.isPackaged
    ? join(process.resourcesPath, 'templates')
    : join(__dirname, '../../templates');

  if (!existsSync(templatesDir)) {
    const { mkdirSync } = require('fs');
    mkdirSync(templatesDir, { recursive: true });
  }

  let finalBuffer = buffer;

  // 領域が指定されている場合はクロップ
  if (region && region.width > 0 && region.height > 0 &&
      !isNaN(region.x) && !isNaN(region.y) && !isNaN(region.width) && !isNaN(region.height)) {
    const image = await Jimp.read(buffer);
    const x = Math.max(0, Math.floor(region.x));
    const y = Math.max(0, Math.floor(region.y));
    const width = Math.floor(region.width);
    const height = Math.floor(region.height);
    image.crop(x, y, width, height);
    finalBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
  }

  const filepath = join(templatesDir, `${name}.png`);
  writeFileSync(filepath, finalBuffer);
  return filepath;
});

// テンプレート画像保存（base64データから）
ipcMain.handle('capture:saveTemplateFromData', async (_, name: string, base64Data: string, region?: Region) => {
  const Jimp = require('jimp');

  const templatesDir = app.isPackaged
    ? join(process.resourcesPath, 'templates')
    : join(__dirname, '../../templates');

  if (!existsSync(templatesDir)) {
    const { mkdirSync } = require('fs');
    mkdirSync(templatesDir, { recursive: true });
  }

  // Base64からBufferに変換
  const buffer = Buffer.from(base64Data, 'base64');
  let finalBuffer = buffer;

  // 領域が指定されている場合はクロップ
  if (region && region.width > 0 && region.height > 0 &&
      !isNaN(region.x) && !isNaN(region.y) && !isNaN(region.width) && !isNaN(region.height)) {
    console.log(`Cropping: x=${region.x}, y=${region.y}, w=${region.width}, h=${region.height}`);
    const image = await Jimp.read(buffer);
    const x = Math.max(0, Math.floor(region.x));
    const y = Math.max(0, Math.floor(region.y));
    const width = Math.min(Math.floor(region.width), image.getWidth() - x);
    const height = Math.min(Math.floor(region.height), image.getHeight() - y);
    image.crop(x, y, width, height);
    finalBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
    console.log(`Cropped to: ${width}x${height}`);
  }

  const filepath = join(templatesDir, `${name}.png`);
  writeFileSync(filepath, finalBuffer);
  return filepath;
});

// テンプレート一覧取得
ipcMain.handle('capture:listTemplates', async () => {
  const templatesDir = app.isPackaged
    ? join(process.resourcesPath, 'templates')
    : join(__dirname, '../../templates');

  if (!existsSync(templatesDir)) {
    return [];
  }

  const files = readdirSync(templatesDir).filter(f =>
    f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')
  );

  return files.map(file => ({
    name: file.replace(/\.(png|jpg|jpeg)$/i, ''),
    filename: file,
    path: join(templatesDir, file),
  }));
});

// 画像検索テスト
ipcMain.handle('capture:findImage', async (_, templatePath: string, confidence?: number) => {
  const recognizer = scenarioExecutor?.getImageRecognizer();
  if (!recognizer) {
    throw new Error('Recognizer not initialized');
  }

  const result = await recognizer.findImage(templatePath, confidence);
  return result;
});

// マウス位置取得
ipcMain.handle('input:getMousePosition', async () => {
  const controller = scenarioExecutor?.getInputController();
  if (!controller) {
    throw new Error('Controller not initialized');
  }

  return await controller.getMousePosition();
});

// ファイル選択ダイアログ
ipcMain.handle('dialog:openFile', async (_, options: Electron.OpenDialogOptions) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result.filePaths[0] ?? null;
});

// ファイル保存ダイアログ
ipcMain.handle('dialog:saveFile', async (_, options: Electron.SaveDialogOptions) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result.filePath ?? null;
});

// ========================================
// アプリケーションイベント
// ========================================

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 開発時のホットリロード対応
if (isDev) {
  try {
    require('electron-reloader')(module);
  } catch {
    // ignore
  }
}
