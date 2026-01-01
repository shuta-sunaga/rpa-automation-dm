import { config } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { join } from 'path';

config();

export interface SearchConfig {
  keyword: string;
  maxResults: number;
}

export interface MessageConfig {
  template: string;
}

export interface RateLimitConfig {
  delayBetweenDMs: number;  // ミリ秒
  maxDMsPerDay: number;
}

export interface BrowserConfig {
  headless: boolean;
  viewport: {
    width: number;
    height: number;
  };
}

export interface Credentials {
  username: string;
  password: string;
}

export interface AppConfig {
  search: SearchConfig;
  message: MessageConfig;
  rateLimit: RateLimitConfig;
  browser: BrowserConfig;
  credentials: Credentials;
}

const DEFAULT_CONFIG: Omit<AppConfig, 'credentials'> = {
  search: {
    keyword: '',
    maxResults: 50,
  },
  message: {
    template: '',
  },
  rateLimit: {
    delayBetweenDMs: 60000,  // 60秒
    maxDMsPerDay: 50,
  },
  browser: {
    headless: false,
    viewport: {
      width: 1280,
      height: 720,
    },
  },
};

export class ConfigManager {
  private config: AppConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || join(process.cwd(), 'config.yaml');
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    let fileConfig: Partial<AppConfig> = {};

    // config.yamlから読み込み
    if (existsSync(this.configPath)) {
      try {
        const yamlContent = readFileSync(this.configPath, 'utf-8');
        fileConfig = parseYaml(yamlContent) || {};
      } catch (error) {
        console.warn(`Warning: Failed to parse config file: ${this.configPath}`);
      }
    }

    // 環境変数から認証情報を取得
    const credentials: Credentials = {
      username: process.env.X_USERNAME || '',
      password: process.env.X_PASSWORD || '',
    };

    // 環境変数でオーバーライド
    const envOverrides: Partial<AppConfig> = {};

    if (process.env.SEARCH_KEYWORD) {
      envOverrides.search = {
        ...DEFAULT_CONFIG.search,
        ...fileConfig.search,
        keyword: process.env.SEARCH_KEYWORD,
      };
    }

    if (process.env.MESSAGE_TEMPLATE) {
      envOverrides.message = {
        template: process.env.MESSAGE_TEMPLATE,
      };
    }

    if (process.env.HEADLESS) {
      envOverrides.browser = {
        ...DEFAULT_CONFIG.browser,
        ...fileConfig.browser,
        headless: process.env.HEADLESS === 'true',
      };
    }

    return {
      search: {
        ...DEFAULT_CONFIG.search,
        ...fileConfig.search,
        ...envOverrides.search,
      },
      message: {
        ...DEFAULT_CONFIG.message,
        ...fileConfig.message,
        ...envOverrides.message,
      },
      rateLimit: {
        ...DEFAULT_CONFIG.rateLimit,
        ...fileConfig.rateLimit,
      },
      browser: {
        ...DEFAULT_CONFIG.browser,
        ...fileConfig.browser,
        ...envOverrides.browser,
      },
      credentials,
    };
  }

  get(): AppConfig {
    return this.config;
  }

  getSearch(): SearchConfig {
    return this.config.search;
  }

  getMessage(): MessageConfig {
    return this.config.message;
  }

  getRateLimit(): RateLimitConfig {
    return this.config.rateLimit;
  }

  getBrowser(): BrowserConfig {
    return this.config.browser;
  }

  getCredentials(): Credentials {
    return this.config.credentials;
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.credentials.username) {
      errors.push('X_USERNAME is required (set in .env)');
    }

    if (!this.config.credentials.password) {
      errors.push('X_PASSWORD is required (set in .env)');
    }

    if (!this.config.search.keyword) {
      errors.push('search.keyword is required (set in config.yaml or SEARCH_KEYWORD env)');
    }

    if (!this.config.message.template) {
      errors.push('message.template is required (set in config.yaml or MESSAGE_TEMPLATE env)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export const configManager = new ConfigManager();
