import winston from 'winston';
import { join } from 'path';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// カスタムフォーマット
const logFormat = printf(({ level, message, timestamp, stack }) => {
  if (stack) {
    return `${timestamp} [${level}]: ${message}\n${stack}`;
  }
  return `${timestamp} [${level}]: ${message}`;
});

// ログディレクトリ
const LOG_DIR = join(process.cwd(), 'logs');

// メインロガー
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    // コンソール出力
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        logFormat
      ),
    }),
    // ファイル出力（エラー）
    new winston.transports.File({
      filename: join(LOG_DIR, 'error.log'),
      level: 'error',
    }),
    // ファイル出力（全ログ）
    new winston.transports.File({
      filename: join(LOG_DIR, 'combined.log'),
    }),
  ],
});

// DM送信専用ロガー（履歴管理用）
export const dmLogger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: join(LOG_DIR, 'dm-history.log'),
    }),
  ],
});

// DM送信結果の記録
export interface DMLogEntry {
  username: string;
  status: 'success' | 'failed' | 'skipped';
  message?: string;
  error?: string;
  timestamp?: string;
}

export function logDMResult(entry: DMLogEntry): void {
  dmLogger.info('DM送信結果', {
    ...entry,
    timestamp: new Date().toISOString(),
  });

  // コンソールにも出力
  const statusEmoji = {
    success: '✅',
    failed: '❌',
    skipped: '⏭️',
  };

  logger.info(
    `${statusEmoji[entry.status]} @${entry.username}: ${entry.status}${entry.error ? ` - ${entry.error}` : ''}`
  );
}

// 進捗表示
export function logProgress(current: number, total: number, username: string): void {
  const percentage = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
  logger.info(`[${bar}] ${percentage}% (${current}/${total}) - Processing @${username}`);
}
