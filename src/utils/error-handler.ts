import { logger } from './logger.js';

export enum ErrorType {
  AUTH_FAILED = 'AUTH_FAILED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  RATE_LIMITED = 'RATE_LIMITED',
  DM_BLOCKED = 'DM_BLOCKED',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export interface RPAError {
  type: ErrorType;
  message: string;
  recoverable: boolean;
  retryable: boolean;
  details?: unknown;
}

export function classifyError(error: unknown): RPAError {
  const message = error instanceof Error ? error.message : String(error);

  // 認証エラー
  if (message.includes('login') || message.includes('password')) {
    return {
      type: ErrorType.AUTH_FAILED,
      message: 'ログインに失敗しました',
      recoverable: true,
      retryable: true,
      details: error,
    };
  }

  // セッション切れ
  if (message.includes('session') || message.includes('expired')) {
    return {
      type: ErrorType.SESSION_EXPIRED,
      message: 'セッションが切れました',
      recoverable: true,
      retryable: true,
      details: error,
    };
  }

  // レート制限
  if (message.includes('rate') || message.includes('limit') || message.includes('too many')) {
    return {
      type: ErrorType.RATE_LIMITED,
      message: 'レート制限に達しました',
      recoverable: true,
      retryable: false,
      details: error,
    };
  }

  // DMブロック
  if (message.includes('blocked') || message.includes('cannot send')) {
    return {
      type: ErrorType.DM_BLOCKED,
      message: 'このユーザーにはDMを送信できません',
      recoverable: false,
      retryable: false,
      details: error,
    };
  }

  // ユーザー未発見
  if (message.includes('user not found') || message.includes('404')) {
    return {
      type: ErrorType.USER_NOT_FOUND,
      message: 'ユーザーが見つかりません',
      recoverable: false,
      retryable: false,
      details: error,
    };
  }

  // 要素未発見
  if (message.includes('selector') || message.includes('element') || message.includes('timeout')) {
    return {
      type: ErrorType.ELEMENT_NOT_FOUND,
      message: 'ページ要素が見つかりません',
      recoverable: true,
      retryable: true,
      details: error,
    };
  }

  // ネットワークエラー
  if (message.includes('network') || message.includes('connection') || message.includes('ECONNREFUSED')) {
    return {
      type: ErrorType.NETWORK_ERROR,
      message: 'ネットワークエラーが発生しました',
      recoverable: true,
      retryable: true,
      details: error,
    };
  }

  // 不明なエラー
  return {
    type: ErrorType.UNKNOWN,
    message: message || '不明なエラーが発生しました',
    recoverable: false,
    retryable: false,
    details: error,
  };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: RPAError | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = classifyError(error);

      if (!lastError.retryable || attempt === maxRetries) {
        logger.error(`エラー (リトライ不可): ${lastError.message}`);
        throw error;
      }

      logger.warn(`リトライ ${attempt}/${maxRetries}: ${lastError.message}`);
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw new Error(lastError?.message || 'Retry failed');
}
