// マウス・キーボード物理操作モジュール (PowerShell版 - ネイティブ依存なし)
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { Point } from './types';
import { join } from 'path';

const execAsync = promisify(exec);

export class InputController {
  private humanLikeDelay = { min: 50, max: 150 };
  private mouseScriptPath: string;

  constructor(baseDir: string = process.cwd()) {
    this.mouseScriptPath = join(baseDir, 'scripts', 'mouse-control.ps1');
    console.log(`[InputController] Initialized with script: ${this.mouseScriptPath}`);
  }

  // ========================================
  // PowerShell実行
  // ========================================

  private async runPowerShell(script: string): Promise<string> {
    const escapedScript = script.replace(/"/g, '\\"');
    try {
      const { stdout, stderr } = await execAsync(
        `powershell -NoProfile -NonInteractive -Command "${escapedScript}"`,
        { encoding: 'utf8' }
      );
      if (stderr) {
        console.error('[InputController] PowerShell stderr:', stderr);
      }
      return stdout.trim();
    } catch (error: any) {
      console.error('[InputController] PowerShell error:', error.message);
      throw error;
    }
  }

  // ========================================
  // マウス操作
  // ========================================

  /**
   * マウスを指定位置に移動
   */
  async moveTo(point: Point, smooth: boolean = false): Promise<void> {
    // スムーズ移動は一旦無効化（PowerShell呼び出しが多く遅いため）
    await this.setMousePosition(point.x, point.y);
  }

  private async setMousePosition(x: number, y: number): Promise<void> {
    console.log(`[InputController] setMousePosition(${x}, ${y})`);
    // 外部スクリプトを使用
    const command = `powershell -ExecutionPolicy Bypass -File "${this.mouseScriptPath}" -Action move -X ${x} -Y ${y}`;
    try {
      execSync(command, { encoding: 'utf8', timeout: 5000 });
    } catch (error: any) {
      console.error(`[InputController] setMousePosition error:`, error.message);
    }
  }

  /**
   * スムーズなマウス移動
   */
  private async smoothMove(targetX: number, targetY: number): Promise<void> {
    const currentPos = await this.getMousePosition();
    const startX = currentPos.x;
    const startY = currentPos.y;

    const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));
    const steps = Math.max(10, Math.floor(distance / 30));

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      const x = Math.round(startX + (targetX - startX) * eased);
      const y = Math.round(startY + (targetY - startY) * eased);
      await this.setMousePosition(x, y);
      await this.sleep(10);
    }
  }

  /**
   * 左クリック
   */
  async click(point?: Point): Promise<void> {
    console.log(`[InputController] click() called with point:`, point);
    if (point) {
      console.log(`[InputController] Moving to (${point.x}, ${point.y})`);
      await this.moveTo(point);
      await this.randomDelay(50, 150);
    }
    console.log(`[InputController] Executing mouse click`);
    await this.mouseClick('left');
    console.log(`[InputController] Click completed`);
  }

  /**
   * ダブルクリック
   */
  async doubleClick(point?: Point): Promise<void> {
    if (point) {
      await this.moveTo(point);
      await this.randomDelay(50, 150);
    }
    await this.mouseClick('left');
    await this.sleep(50);
    await this.mouseClick('left');
  }

  /**
   * 右クリック
   */
  async rightClick(point?: Point): Promise<void> {
    if (point) {
      await this.moveTo(point);
      await this.randomDelay(50, 150);
    }
    await this.mouseClick('right');
  }

  private async mouseClick(button: 'left' | 'right'): Promise<void> {
    // 外部スクリプトを使用
    const action = button === 'left' ? 'click' : 'rightclick';
    const command = `powershell -ExecutionPolicy Bypass -File "${this.mouseScriptPath}" -Action ${action}`;
    try {
      execSync(command, { encoding: 'utf8', timeout: 5000 });
    } catch (error: any) {
      console.error(`[InputController] mouseClick error:`, error.message);
    }
  }

  /**
   * マウスホイールスクロール
   */
  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void> {
    const wheelDelta = (direction === 'up' || direction === 'left') ? 120 * amount : -120 * amount;

    const script = `
      $signature = @'
      [DllImport("user32.dll")]
      public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
'@
      $mouse = Add-Type -MemberDefinition $signature -Name 'MouseScroll' -Namespace 'Win32' -PassThru
      $mouse::mouse_event(0x0800, 0, 0, ${wheelDelta}, 0)
    `;
    await this.runPowerShell(script);
  }

  /**
   * ドラッグ&ドロップ
   */
  async drag(from: Point, to: Point): Promise<void> {
    await this.moveTo(from);
    await this.randomDelay(100, 200);

    const script = `
      $signature = @'
      [DllImport("user32.dll")]
      public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
'@
      $mouse = Add-Type -MemberDefinition $signature -Name 'MouseDrag' -Namespace 'Win32' -PassThru
      $mouse::mouse_event(0x0002, 0, 0, 0, 0)
    `;
    await this.runPowerShell(script);

    await this.moveTo(to);
    await this.randomDelay(100, 200);

    const releaseScript = `
      $signature = @'
      [DllImport("user32.dll")]
      public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
'@
      $mouse = Add-Type -MemberDefinition $signature -Name 'MouseRelease' -Namespace 'Win32' -PassThru
      $mouse::mouse_event(0x0004, 0, 0, 0, 0)
    `;
    await this.runPowerShell(releaseScript);
  }

  // ========================================
  // キーボード操作
  // ========================================

  /**
   * テキストを入力 (SendKeys使用)
   */
  async type(text: string, humanLike: boolean = false): Promise<void> {
    if (humanLike) {
      await this.typeHumanLike(text);
    } else {
      // 特殊文字をエスケープ
      const escapedText = this.escapeSendKeys(text);
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait('${escapedText}')
      `;
      await this.runPowerShell(script);
    }
  }

  /**
   * 人間らしいタイピング
   */
  private async typeHumanLike(text: string): Promise<void> {
    for (const char of text) {
      const escapedChar = this.escapeSendKeys(char);
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait('${escapedChar}')
      `;
      await this.runPowerShell(script);
      await this.randomDelay(this.humanLikeDelay.min, this.humanLikeDelay.max);
    }
  }

  /**
   * SendKeys用にテキストをエスケープ
   */
  private escapeSendKeys(text: string): string {
    // SendKeysの特殊文字をエスケープ
    return text
      .replace(/\+/g, '{+}')
      .replace(/\^/g, '{^}')
      .replace(/%/g, '{%}')
      .replace(/~/g, '{~}')
      .replace(/\(/g, '{(}')
      .replace(/\)/g, '{)}')
      .replace(/\[/g, '{[}')
      .replace(/\]/g, '{]}')
      .replace(/\{/g, '{{}')
      .replace(/\}/g, '{}}')
      .replace(/'/g, "''");
  }

  /**
   * キーを押下
   */
  async pressKey(key: string): Promise<void> {
    const sendKey = this.mapKeyToSendKeys(key);
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('${sendKey}')
    `;
    await this.runPowerShell(script);
  }

  /**
   * キーコンボ (Ctrl+C 等)
   */
  async keyCombo(keys: string[]): Promise<void> {
    let combo = '';

    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'control' || lowerKey === 'ctrl') {
        combo += '^';
      } else if (lowerKey === 'alt') {
        combo += '%';
      } else if (lowerKey === 'shift') {
        combo += '+';
      } else {
        combo += this.mapKeyToSendKeys(key);
      }
    }

    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('${combo}')
    `;
    await this.runPowerShell(script);
  }

  /**
   * キー名をSendKeysフォーマットにマッピング
   */
  private mapKeyToSendKeys(keyName: string): string {
    const keyMap: Record<string, string> = {
      'Enter': '{ENTER}',
      'Return': '{ENTER}',
      'Tab': '{TAB}',
      'Escape': '{ESC}',
      'Esc': '{ESC}',
      'Backspace': '{BACKSPACE}',
      'Delete': '{DELETE}',
      'Space': ' ',

      'Up': '{UP}',
      'Down': '{DOWN}',
      'Left': '{LEFT}',
      'Right': '{RIGHT}',
      'ArrowUp': '{UP}',
      'ArrowDown': '{DOWN}',
      'ArrowLeft': '{LEFT}',
      'ArrowRight': '{RIGHT}',

      'Home': '{HOME}',
      'End': '{END}',
      'PageUp': '{PGUP}',
      'PageDown': '{PGDN}',
      'Insert': '{INSERT}',

      'F1': '{F1}',
      'F2': '{F2}',
      'F3': '{F3}',
      'F4': '{F4}',
      'F5': '{F5}',
      'F6': '{F6}',
      'F7': '{F7}',
      'F8': '{F8}',
      'F9': '{F9}',
      'F10': '{F10}',
      'F11': '{F11}',
      'F12': '{F12}',
    };

    return keyMap[keyName] || keyName.toLowerCase();
  }

  // ========================================
  // ユーティリティ
  // ========================================

  /**
   * ランダムな遅延
   */
  async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.sleep(delay);
  }

  /**
   * 固定遅延
   */
  async wait(ms: number): Promise<void> {
    await this.sleep(ms);
  }

  /**
   * 人間らしい遅延設定
   */
  setHumanLikeDelay(min: number, max: number): void {
    this.humanLikeDelay = { min, max };
  }

  /**
   * 現在のマウス位置を取得
   */
  async getMousePosition(): Promise<Point> {
    // 外部スクリプトを使用
    const command = `powershell -ExecutionPolicy Bypass -File "${this.mouseScriptPath}" -Action getpos`;
    try {
      const result = execSync(command, { encoding: 'utf8', timeout: 5000 }).trim();
      const [x, y] = result.split(',').map(Number);
      return { x: x || 0, y: y || 0 };
    } catch (error: any) {
      console.error(`[InputController] getMousePosition error:`, error.message);
      return { x: 0, y: 0 };
    }
  }

  /**
   * スリープ
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
