# Image RPA Studio - 実装状況ログ

最終更新: 2026-01-05

## プロジェクト概要

**目的:** X (Twitter) DM自動送信のための画像認識ベースRPAツール（Robo-Pat風）

**技術スタック:**
- Electron (Windows デスクトップアプリ)
- TypeScript
- Jimp (画像認識・テンプレートマッチング)
- PowerShell (マウス/キーボード制御、スクリーンキャプチャ)

**要件:**
- Pythonやネイティブビルドツール不要
- 画像認識でUI要素を検出
- 物理的なマウス/キーボード操作（ブラウザ自動化ではない）
- GUIでシナリオ作成・編集

---

## 現在の実装状況

### 完了済み機能

1. **Electronアプリ基盤**
   - メインプロセス (`src/electron/main.ts`)
   - プリロード (`src/electron/preload.ts`)
   - レンダラー (`src/renderer/`)
   - 多重起動防止 (single instance lock)

2. **画像認識エンジン** (`src/rpa/image-recognizer.ts`)
   - テンプレートマッチング (NCC: 正規化相互相関)
   - 外部PowerShellスクリプトによるスクリーンキャプチャ
   - 画像待機・消失待機機能

3. **シナリオ実行エンジン** (`src/rpa/scenario-executor.ts`)
   - 各種アクション実行
   - 一時停止/再開/停止
   - イベントエミッター

4. **GUI**
   - シナリオエディタ
   - ステップ追加・編集・削除
   - テンプレートセレクター（グリッド表示）
   - ステップエディタ内での画像キャプチャ
   - 選択範囲のトリミング保存
   - 実行ログ表示（スクロール可能）

5. **外部PowerShellスクリプト**
   - `scripts/capture-screen.ps1` - スクリーンキャプチャ
   - `scripts/mouse-control.ps1` - マウス操作 (NEW)

### 対応済み問題

1. **インラインPowerShellの型解決エラー**
   - 症状: `[System.Drawing.Point] が見つかりません`
   - 原因: インラインPowerShellコマンドでの型解決問題
   - 解決: 外部.ps1スクリプトファイルを使用

2. **画像認識の信頼度閾値**
   - 症状: 「Image not found」エラー（信頼度0.572 < 閾値0.9）
   - 解決: デフォルト閾値を0.9から0.5に変更
   - 変更箇所:
     - `src/rpa/scenario-executor.ts`
     - `src/renderer/app.js`

3. **UIの各種問題**
   - テンプレート名入力不可 → モーダルのz-index/hidden修正
   - ステップ保存ボタン押せない → 同上
   - 画像キャプチャのトリミング不正 → スケール計算追加
   - ログスクロール不可 → max-height追加

---

## 現在の課題（未解決）

### マウス操作が実行されない

**症状:**
- 画像認識は成功（`[ImageRecognizer] ✓ Image FOUND!`）
- `[InputController] click()` が呼ばれている
- しかしカーソルが動かない、クリックされない

**試した対策:**
1. インラインPowerShell → 外部スクリプト化 (`mouse-control.ps1`)
2. `System.Drawing.Point` → `user32.dll SetCursorPos` に変更
3. スムーズ移動を無効化（PowerShell呼び出し削減）

**次のデバッグ手順:**
1. `mouse-control.ps1` を単体でテスト
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/mouse-control.ps1 -Action move -X 500 -Y 500
   powershell -ExecutionPolicy Bypass -File scripts/mouse-control.ps1 -Action click
   ```
2. エラー出力の確認
3. 管理者権限の問題か確認

---

## ファイル構成

```
rpa-automation-dm/
├── src/
│   ├── electron/
│   │   ├── main.ts          # Electronメインプロセス
│   │   └── preload.ts       # IPC通信ブリッジ
│   ├── renderer/
│   │   ├── index.html       # GUI HTML
│   │   ├── styles.css       # スタイル
│   │   └── app.js           # フロントエンドロジック
│   └── rpa/
│       ├── types.ts         # 型定義
│       ├── image-recognizer.ts  # 画像認識
│       ├── input-controller.ts  # マウス/キーボード制御
│       └── scenario-executor.ts # シナリオ実行
├── scripts/
│   ├── capture-screen.ps1   # スクリーンキャプチャ
│   └── mouse-control.ps1    # マウス操作 (NEW)
├── templates/               # テンプレート画像保存先
├── scenarios/               # シナリオJSON保存先
├── dist/                    # コンパイル済みファイル
├── START-RPA.bat            # 起動スクリプト
└── package.json
```

---

## 重要な設定値

### 画像認識
- デフォルト信頼度閾値: **0.5** (以前は0.9)
- ポーリング間隔: 500ms
- タイムアウト: 30000ms

### スクリーンキャプチャ
- 外部スクリプト使用（インラインPowerShellは動作しない）
- アプリウィンドウを隠してからキャプチャ

---

## 起動方法

```bash
# 開発・デバッグ
START-RPA.bat

# または手動
npm run build:electron
npm start
```

---

## 次回の作業項目

1. **マウス操作のデバッグ**
   - `mouse-control.ps1` の単体テスト
   - 必要に応じてデバッグログ追加

2. **パフォーマンス改善**
   - スムーズ移動の最適化（現在無効化中）

3. **追加機能**
   - シナリオの保存/読み込み
   - X DM送信に必要な具体的なワークフロー

---

## 参考コマンド

```powershell
# マウス操作テスト
powershell -ExecutionPolicy Bypass -File scripts/mouse-control.ps1 -Action move -X 500 -Y 500
powershell -ExecutionPolicy Bypass -File scripts/mouse-control.ps1 -Action click
powershell -ExecutionPolicy Bypass -File scripts/mouse-control.ps1 -Action getpos

# スクリーンキャプチャテスト
powershell -ExecutionPolicy Bypass -File scripts/capture-screen.ps1 -OutputPath test.png
```
