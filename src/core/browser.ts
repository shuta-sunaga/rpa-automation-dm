import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BrowserConfig } from '../config/settings.js';
import { logger } from '../utils/logger.js';
import { join } from 'path';

export class BrowserController {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: BrowserConfig;

  constructor(config: BrowserConfig) {
    this.config = config;
  }

  async launch(): Promise<Page> {
    logger.info('ブラウザを起動中...');

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    // セッション保存用のディレクトリ
    const userDataDir = join(process.cwd(), '.browser-data');

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
    });

    // 自動化検出を回避
    await this.context.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    `);

    this.page = await this.context.newPage();

    logger.info('ブラウザ起動完了');
    return this.page;
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.page;
  }

  async close(): Promise<void> {
    logger.info('ブラウザを終了中...');

    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    logger.info('ブラウザ終了完了');
  }

  // 人間らしい待機時間（ランダム）
  async humanDelay(minMs: number = 500, maxMs: number = 1500): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // 人間らしいタイピング
  async humanType(selector: string, text: string): Promise<void> {
    const page = this.getPage();
    await page.click(selector);

    for (const char of text) {
      await page.keyboard.type(char);
      // 文字ごとにランダムな遅延（50-150ms）
      await new Promise(resolve =>
        setTimeout(resolve, Math.floor(Math.random() * 100) + 50)
      );
    }
  }

  // スクリーンショット保存
  async screenshot(name: string): Promise<void> {
    const page = this.getPage();
    const screenshotDir = join(process.cwd(), 'screenshots');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({
      path: join(screenshotDir, `${name}-${timestamp}.png`),
      fullPage: true,
    });
  }

  // 要素の存在確認
  async elementExists(selector: string, timeout: number = 5000): Promise<boolean> {
    const page = this.getPage();
    try {
      await page.waitForSelector(selector, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  // 安全なクリック（要素が見えるまで待機）
  async safeClick(selector: string, timeout: number = 10000): Promise<void> {
    const page = this.getPage();
    await page.waitForSelector(selector, { state: 'visible', timeout });
    await this.humanDelay(200, 500);
    await page.click(selector);
  }
}
