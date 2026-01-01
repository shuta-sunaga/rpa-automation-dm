# X (Twitter) DM自動送信RPA - 設計書

## 1. 概要

ユーザーが入力したキーワードでXを検索し、ヒットしたユーザーに対して
あらかじめ設定した固定文言のDMを自動送信するRPAシステム。

## 2. システムフロー

```
┌─────────────────────────────────────────────────────────────┐
│                      メインフロー                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │ 設定読込  │───▶│ X認証    │───▶│キーワード │             │
│  │          │    │ ログイン  │    │ 検索     │             │
│  └──────────┘    └──────────┘    └──────────┘             │
│                                        │                    │
│                                        ▼                    │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │ 完了報告  │◀───│ DM送信   │◀───│ユーザー  │             │
│  │ ログ出力  │    │          │    │ 一覧取得  │             │
│  └──────────┘    └──────────┘    └──────────┘             │
│                        │                                    │
│                        ▼                                    │
│                  ┌──────────┐                              │
│                  │次ユーザー │◀─────┐                      │
│                  │ へ進む   │       │ ループ               │
│                  └──────────┘───────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 3. コンポーネント設計

### 3.1 ディレクトリ構成

```
src/
├── config/
│   ├── settings.ts          # 設定管理
│   └── messages.ts          # DM文言テンプレート
├── core/
│   ├── browser.ts           # ブラウザ制御 (Playwright)
│   ├── auth.ts              # X認証処理
│   └── rpa-engine.ts        # RPAエンジン本体
├── modules/
│   ├── search.ts            # キーワード検索モジュール
│   ├── user-list.ts         # ユーザーリスト管理
│   └── dm-sender.ts         # DM送信モジュール
├── utils/
│   ├── logger.ts            # ログ出力
│   ├── rate-limiter.ts      # レート制限対応
│   └── error-handler.ts     # エラーハンドリング
└── index.ts                 # エントリーポイント
```

### 3.2 主要クラス/モジュール

#### ConfigManager
```typescript
interface Config {
  searchKeyword: string;      // 検索キーワード
  messageTemplate: string;    // DM文言テンプレート
  maxUsersPerSession: number; // 1セッションあたりの最大送信数
  delayBetweenDMs: number;    // DM間の待機時間(ms)
  headless: boolean;          // ヘッドレスモード
}
```

#### XAuthenticator
```typescript
class XAuthenticator {
  async login(credentials: Credentials): Promise<void>
  async isLoggedIn(): Promise<boolean>
  async handleTwoFactor(): Promise<void>
}
```

#### SearchModule
```typescript
class SearchModule {
  async searchUsers(keyword: string): Promise<UserProfile[]>
  async getNextPage(): Promise<UserProfile[]>
}
```

#### DMSender
```typescript
class DMSender {
  async openDMWindow(user: UserProfile): Promise<void>
  async typeMessage(message: string): Promise<void>
  async send(): Promise<SendResult>
  async close(): Promise<void>
}
```

## 4. 詳細フロー

### 4.1 DM送信フロー（1ユーザー）

```
1. ユーザープロフィールページへ遷移
   URL: https://x.com/{username}

2. DMボタンをクリック
   Selector: [data-testid="sendDMFromProfile"]

3. DMダイアログが開くのを待機
   Selector: [data-testid="dmComposerTextInput"]

4. メッセージを入力
   - 文字を1文字ずつ入力（人間らしい挙動）
   - 入力間隔: 50-150ms (ランダム)

5. 送信ボタンをクリック
   Selector: [data-testid="dmComposerSendButton"]

6. 送信完了を確認
   - 成功: メッセージが送信済みリストに表示
   - 失敗: エラーメッセージ検出

7. ログ記録 & 次のユーザーへ
```

### 4.2 エラーハンドリング

| エラー種別 | 対応 |
|-----------|------|
| ログインセッション切れ | 再ログイン後リトライ |
| DM送信制限 | 指定時間待機後に再開 |
| ユーザーがDM受信拒否 | スキップしてログ記録 |
| ネットワークエラー | 3回リトライ後スキップ |
| 要素が見つからない | ページリロード後リトライ |

## 5. レート制限対策

X のDM送信制限を回避するための対策:

1. **送信間隔の調整**
   - 最小間隔: 30秒
   - 推奨間隔: 60-120秒 (ランダム)

2. **1日あたりの上限**
   - 推奨: 50-100通/日
   - 上限到達時は翌日まで待機

3. **人間らしい挙動**
   - マウス移動のシミュレーション
   - スクロール動作の追加
   - ランダムな待機時間

## 6. セキュリティ考慮事項

- 認証情報は `.env` ファイルで管理
- `.env` は `.gitignore` に追加
- ログにパスワードを出力しない
- セッション情報の暗号化保存

## 7. 設定ファイル例

```yaml
# config.yaml
search:
  keyword: "プログラミング 初心者"
  max_results: 100

message:
  template: |
    はじめまして！
    プログラミングに興味をお持ちとのことで、
    ぜひお話しできればと思いDMさせていただきました。
    お時間ある時にお返事いただけると嬉しいです！

rate_limit:
  delay_between_dms: 60000  # 60秒
  max_dms_per_day: 50

browser:
  headless: false
  viewport:
    width: 1280
    height: 720
```

## 8. 技術スタック

| 用途 | 技術 |
|------|------|
| ブラウザ自動化 | Playwright |
| 言語 | TypeScript |
| 設定管理 | dotenv + yaml |
| ログ | winston |
| CLI | Commander.js |

## 9. 開発フェーズ

### Phase 1: 基盤構築
- [ ] プロジェクト構成セットアップ
- [ ] Playwright導入
- [ ] 設定管理モジュール

### Phase 2: 認証機能
- [ ] Xログイン処理
- [ ] セッション管理
- [ ] 2FA対応

### Phase 3: 検索機能
- [ ] キーワード検索
- [ ] ユーザーリスト取得
- [ ] ページネーション対応

### Phase 4: DM送信機能
- [ ] DM画面操作
- [ ] メッセージ入力・送信
- [ ] 送信結果確認

### Phase 5: 安定化
- [ ] エラーハンドリング強化
- [ ] レート制限対応
- [ ] ログ・レポート機能

---

作成日: 2026-01-01
作成者: Miyabi Agent
