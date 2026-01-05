// RPA アクションタイプ定義

export interface Point {
  x: number;
  y: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MatchResult {
  found: boolean;
  confidence: number;
  location: Point;
  region: Region;
}

// アクションタイプ
export type ActionType =
  | 'image_click'      // 画像を探してクリック
  | 'image_double_click' // 画像を探してダブルクリック
  | 'image_right_click' // 画像を探して右クリック
  | 'image_wait'       // 画像が表示されるまで待機
  | 'type_text'        // テキスト入力
  | 'key_press'        // キー押下
  | 'key_combo'        // キーコンボ (Ctrl+C等)
  | 'wait'             // 待機
  | 'scroll'           // スクロール
  | 'mouse_move'       // マウス移動
  | 'click_position'   // 座標クリック
  | 'condition'        // 条件分岐
  | 'loop'             // ループ
  | 'set_variable'     // 変数設定
  | 'screenshot'       // スクリーンショット保存
  | 'log';             // ログ出力

// 基本アクション
export interface BaseAction {
  id: string;
  type: ActionType;
  description?: string;
  timeout?: number;      // タイムアウト(ms)
  onError?: 'stop' | 'skip' | 'retry';
  retryCount?: number;
}

// 画像クリックアクション
export interface ImageClickAction extends BaseAction {
  type: 'image_click' | 'image_double_click' | 'image_right_click';
  imagePath: string;
  confidence?: number;   // 0.0-1.0 (デフォルト: 0.9)
  searchRegion?: Region; // 検索範囲を限定
  offsetX?: number;      // クリック位置オフセット
  offsetY?: number;
}

// 画像待機アクション
export interface ImageWaitAction extends BaseAction {
  type: 'image_wait';
  imagePath: string;
  confidence?: number;
  searchRegion?: Region;
  waitUntilGone?: boolean; // trueなら画像が消えるまで待機
}

// テキスト入力アクション
export interface TypeTextAction extends BaseAction {
  type: 'type_text';
  text: string;
  humanLike?: boolean;    // 人間らしいタイピング
  delayMin?: number;      // 最小遅延(ms)
  delayMax?: number;      // 最大遅延(ms)
}

// キー押下アクション
export interface KeyPressAction extends BaseAction {
  type: 'key_press';
  key: string;  // 'Enter', 'Tab', 'Escape', etc.
}

// キーコンボアクション
export interface KeyComboAction extends BaseAction {
  type: 'key_combo';
  keys: string[];  // ['Control', 'C']
}

// 待機アクション
export interface WaitAction extends BaseAction {
  type: 'wait';
  duration: number;  // ミリ秒
  randomize?: boolean; // ランダム化
  randomMin?: number;
  randomMax?: number;
}

// スクロールアクション
export interface ScrollAction extends BaseAction {
  type: 'scroll';
  direction: 'up' | 'down' | 'left' | 'right';
  amount: number;
}

// マウス移動アクション
export interface MouseMoveAction extends BaseAction {
  type: 'mouse_move';
  x: number;
  y: number;
  smooth?: boolean;
}

// 座標クリックアクション
export interface ClickPositionAction extends BaseAction {
  type: 'click_position';
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
}

// 条件分岐アクション
export interface ConditionAction extends BaseAction {
  type: 'condition';
  condition: {
    type: 'image_exists' | 'image_not_exists' | 'variable_equals';
    imagePath?: string;
    confidence?: number;
    variableName?: string;
    variableValue?: string;
  };
  thenSteps: Action[];
  elseSteps?: Action[];
}

// ループアクション
export interface LoopAction extends BaseAction {
  type: 'loop';
  loopType: 'count' | 'while_image_exists' | 'while_image_not_exists' | 'for_each';
  count?: number;
  imagePath?: string;
  confidence?: number;
  items?: string[];       // for_each用
  variableName?: string;  // for_each用の変数名
  steps: Action[];
  maxIterations?: number; // 安全のための最大回数
}

// 変数設定アクション
export interface SetVariableAction extends BaseAction {
  type: 'set_variable';
  variableName: string;
  value: string;
}

// スクリーンショットアクション
export interface ScreenshotAction extends BaseAction {
  type: 'screenshot';
  filename: string;
  region?: Region;
}

// ログアクション
export interface LogAction extends BaseAction {
  type: 'log';
  message: string;
  level?: 'info' | 'warn' | 'error';
}

// 全アクション型
export type Action =
  | ImageClickAction
  | ImageWaitAction
  | TypeTextAction
  | KeyPressAction
  | KeyComboAction
  | WaitAction
  | ScrollAction
  | MouseMoveAction
  | ClickPositionAction
  | ConditionAction
  | LoopAction
  | SetVariableAction
  | ScreenshotAction
  | LogAction;

// シナリオ定義
export interface Scenario {
  id: string;
  name: string;
  description?: string;
  version: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  variables: Record<string, string>;
  steps: Action[];
  settings?: {
    defaultTimeout?: number;
    defaultConfidence?: number;
    screenshotOnError?: boolean;
    stopOnError?: boolean;
  };
}

// 実行状態
export interface ExecutionState {
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'error';
  currentStepIndex: number;
  currentStepId: string;
  variables: Record<string, string>;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  logs: ExecutionLog[];
}

export interface ExecutionLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  stepId?: string;
  details?: unknown;
}

// IPC通信用メッセージ
export interface IPCMessage {
  type: string;
  payload?: unknown;
}

export interface ScenarioListItem {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
}
