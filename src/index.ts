import { Command } from 'commander';
import { ConfigManager } from './config/settings.js';
import { BrowserController } from './core/browser.js';
import { logger } from './utils/logger.js';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// 必要なディレクトリを作成
const dirs = ['logs', 'screenshots', '.browser-data'];
dirs.forEach(dir => {
  const path = join(process.cwd(), dir);
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
});

const program = new Command();

program
  .name('x-dm-rpa')
  .description('X (Twitter) DM自動送信RPA')
  .version('0.1.0');

program
  .command('run')
  .description('RPA実行 - キーワード検索してDMを自動送信')
  .option('-k, --keyword <keyword>', '検索キーワード')
  .option('-m, --message <message>', 'DMメッセージ')
  .option('-n, --max <number>', '最大送信数', '50')
  .option('--headless', 'ヘッドレスモードで実行')
  .option('--dry-run', '実際には送信せずシミュレーション')
  .action(async (options) => {
    logger.info('=== X DM自動送信RPA 開始 ===');

    const config = new ConfigManager();
    const appConfig = config.get();

    // CLIオプションでオーバーライド
    if (options.keyword) {
      appConfig.search.keyword = options.keyword;
    }
    if (options.message) {
      appConfig.message.template = options.message;
    }
    if (options.max) {
      appConfig.search.maxResults = parseInt(options.max, 10);
    }
    if (options.headless) {
      appConfig.browser.headless = true;
    }

    // 設定のバリデーション
    const validation = config.validate();
    if (!validation.valid) {
      logger.error('設定エラー:');
      validation.errors.forEach(err => logger.error(`  - ${err}`));
      process.exit(1);
    }

    logger.info(`検索キーワード: ${appConfig.search.keyword}`);
    logger.info(`最大送信数: ${appConfig.search.maxResults}`);
    logger.info(`DRYモード: ${options.dryRun ? 'ON' : 'OFF'}`);

    if (options.dryRun) {
      logger.info('DRY RUNモードのため、実際の送信は行いません');
    }

    const browser = new BrowserController(appConfig.browser);

    try {
      await browser.launch();

      // TODO: Phase 2以降で実装
      // 1. X にログイン
      // 2. キーワード検索
      // 3. ユーザーリスト取得
      // 4. 各ユーザーにDM送信

      logger.info('Phase 1 完了 - 基盤構築のみ');
      logger.info('Phase 2以降の実装をお待ちください');

    } catch (error) {
      logger.error('RPA実行中にエラーが発生しました', error);
    } finally {
      await browser.close();
    }

    logger.info('=== X DM自動送信RPA 終了 ===');
  });

program
  .command('config')
  .description('設定を確認')
  .action(() => {
    const config = new ConfigManager();
    const appConfig = config.get();

    console.log('\n=== 現在の設定 ===\n');
    console.log('検索設定:');
    console.log(`  キーワード: ${appConfig.search.keyword || '(未設定)'}`);
    console.log(`  最大件数: ${appConfig.search.maxResults}`);
    console.log('\nメッセージ:');
    console.log(`  テンプレート: ${appConfig.message.template ? '設定済み' : '(未設定)'}`);
    console.log('\nレート制限:');
    console.log(`  DM間隔: ${appConfig.rateLimit.delayBetweenDMs / 1000}秒`);
    console.log(`  1日上限: ${appConfig.rateLimit.maxDMsPerDay}通`);
    console.log('\nブラウザ:');
    console.log(`  ヘッドレス: ${appConfig.browser.headless}`);
    console.log(`  ビューポート: ${appConfig.browser.viewport.width}x${appConfig.browser.viewport.height}`);
    console.log('\n認証:');
    console.log(`  ユーザー名: ${appConfig.credentials.username ? '設定済み' : '(未設定)'}`);
    console.log(`  パスワード: ${appConfig.credentials.password ? '設定済み' : '(未設定)'}`);

    const validation = config.validate();
    if (!validation.valid) {
      console.log('\n⚠️  設定エラー:');
      validation.errors.forEach(err => console.log(`  - ${err}`));
    } else {
      console.log('\n✅ 設定は有効です');
    }
  });

program
  .command('test')
  .description('ブラウザ起動テスト')
  .action(async () => {
    logger.info('ブラウザ起動テストを開始...');

    const config = new ConfigManager();
    const browser = new BrowserController(config.getBrowser());

    try {
      const page = await browser.launch();
      await page.goto('https://x.com');
      logger.info('X.com にアクセスしました');

      await browser.humanDelay(2000, 3000);

      const title = await page.title();
      logger.info(`ページタイトル: ${title}`);

      await browser.screenshot('test-access');
      logger.info('スクリーンショットを保存しました');

    } catch (error) {
      logger.error('テスト中にエラーが発生しました', error);
    } finally {
      await browser.close();
    }

    logger.info('ブラウザ起動テスト完了');
  });

program.parse();
