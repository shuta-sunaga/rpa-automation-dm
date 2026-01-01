import { logger } from './logger.js';
import { RateLimitConfig } from '../config/settings.js';

export class RateLimiter {
  private config: RateLimitConfig;
  private dmCount: number = 0;
  private lastDMTime: number = 0;
  private dailyResetTime: number;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.dailyResetTime = this.getNextMidnight();
  }

  private getNextMidnight(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    return tomorrow.getTime();
  }

  private checkDailyReset(): void {
    const now = Date.now();
    if (now >= this.dailyResetTime) {
      logger.info('日次カウンターをリセットしました');
      this.dmCount = 0;
      this.dailyResetTime = this.getNextMidnight();
    }
  }

  async waitForNextDM(): Promise<void> {
    this.checkDailyReset();

    // 1日の上限チェック
    if (this.dmCount >= this.config.maxDMsPerDay) {
      const waitTime = this.dailyResetTime - Date.now();
      const hours = Math.ceil(waitTime / (1000 * 60 * 60));
      logger.warn(`1日の送信上限(${this.config.maxDMsPerDay}通)に達しました。${hours}時間後に再開します`);
      throw new Error(`Daily DM limit reached. Wait ${hours} hours.`);
    }

    // 前回のDMからの経過時間をチェック
    const now = Date.now();
    const elapsed = now - this.lastDMTime;
    const requiredDelay = this.config.delayBetweenDMs;

    if (elapsed < requiredDelay && this.lastDMTime > 0) {
      const waitTime = requiredDelay - elapsed;
      // ランダムな追加待機時間（0-30%）
      const randomExtra = Math.floor(Math.random() * (waitTime * 0.3));
      const totalWait = waitTime + randomExtra;

      logger.info(`レート制限: ${Math.ceil(totalWait / 1000)}秒待機中...`);
      await new Promise(resolve => setTimeout(resolve, totalWait));
    }
  }

  recordDM(): void {
    this.dmCount++;
    this.lastDMTime = Date.now();
    logger.info(`本日のDM送信数: ${this.dmCount}/${this.config.maxDMsPerDay}`);
  }

  getRemainingToday(): number {
    this.checkDailyReset();
    return this.config.maxDMsPerDay - this.dmCount;
  }

  getStats(): { sent: number; remaining: number; nextReset: Date } {
    return {
      sent: this.dmCount,
      remaining: this.getRemainingToday(),
      nextReset: new Date(this.dailyResetTime),
    };
  }
}
