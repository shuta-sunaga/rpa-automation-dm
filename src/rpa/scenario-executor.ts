// シナリオ実行エンジン
import { EventEmitter } from 'events';
import { ImageRecognizer } from './image-recognizer';
import { InputController } from './input-controller';
import {
  Scenario,
  Action,
  ExecutionState,
  ExecutionLog,
  ImageClickAction,
  ImageWaitAction,
  TypeTextAction,
  KeyPressAction,
  KeyComboAction,
  WaitAction,
  ScrollAction,
  MouseMoveAction,
  ClickPositionAction,
  ConditionAction,
  LoopAction,
  SetVariableAction,
  ScreenshotAction,
  LogAction,
} from './types';

export class ScenarioExecutor extends EventEmitter {
  private imageRecognizer: ImageRecognizer;
  private inputController: InputController;
  private state: ExecutionState;
  private scenario: Scenario | null = null;
  private abortController: AbortController | null = null;

  constructor(baseDir?: string) {
    super();
    this.imageRecognizer = new ImageRecognizer(baseDir);
    this.inputController = new InputController(baseDir);
    this.state = this.createInitialState();
  }

  private createInitialState(): ExecutionState {
    return {
      status: 'idle',
      currentStepIndex: -1,
      currentStepId: '',
      variables: {},
      logs: [],
    };
  }

  /**
   * シナリオを読み込み
   */
  loadScenario(scenario: Scenario): void {
    this.scenario = scenario;
    this.state = this.createInitialState();
    this.state.variables = { ...scenario.variables };
    this.log('info', `Scenario loaded: ${scenario.name}`);
  }

  /**
   * シナリオを実行
   */
  async execute(): Promise<void> {
    if (!this.scenario) {
      throw new Error('No scenario loaded');
    }

    this.abortController = new AbortController();
    this.state.status = 'running';
    this.state.startTime = new Date();
    this.emit('stateChange', this.state);

    try {
      await this.executeSteps(this.scenario.steps);
      this.state.status = 'completed';
      this.state.endTime = new Date();
      this.log('info', 'Scenario completed successfully');
    } catch (error) {
      // Check if stopped by user (status may have been changed externally)
      if ((this.state.status as string) !== 'stopped') {
        this.state.status = 'error';
        this.state.error = error instanceof Error ? error.message : String(error);
        this.log('error', `Execution error: ${this.state.error}`);
      }
    } finally {
      this.emit('stateChange', this.state);
      this.emit('complete', this.state);
    }
  }

  /**
   * 実行を停止
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.state.status = 'stopped';
    this.log('info', 'Execution stopped by user');
    this.emit('stateChange', this.state);
  }

  /**
   * 実行を一時停止
   */
  pause(): void {
    if (this.state.status === 'running') {
      this.state.status = 'paused';
      this.log('info', 'Execution paused');
      this.emit('stateChange', this.state);
    }
  }

  /**
   * 実行を再開
   */
  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      this.log('info', 'Execution resumed');
      this.emit('stateChange', this.state);
    }
  }

  /**
   * 現在の状態を取得
   */
  getState(): ExecutionState {
    return { ...this.state };
  }

  // ========================================
  // ステップ実行
  // ========================================

  private async executeSteps(steps: Action[]): Promise<void> {
    for (let i = 0; i < steps.length; i++) {
      // 停止チェック
      if (this.abortController?.signal.aborted || this.state.status === 'stopped') {
        throw new Error('Execution aborted');
      }

      // 一時停止待機
      while (this.state.status === 'paused') {
        await this.sleep(100);
        if (this.abortController?.signal.aborted) {
          throw new Error('Execution aborted');
        }
      }

      const step = steps[i];
      this.state.currentStepIndex = i;
      this.state.currentStepId = step.id;
      this.emit('stepStart', step);
      this.log('info', `Executing step: ${step.type} - ${step.description || step.id}`);

      try {
        await this.executeAction(step);
        this.emit('stepComplete', step);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.log('error', `Step failed: ${errorMsg}`, step.id);
        this.emit('stepError', { step, error });

        const onError: 'stop' | 'skip' | 'retry' = step.onError ||
          (this.scenario?.settings?.stopOnError ? 'stop' : 'skip');

        switch (onError) {
          case 'stop':
            throw error;
          case 'retry':
            const retryCount = step.retryCount || 3;
            let retried = false;
            for (let r = 0; r < retryCount; r++) {
              this.log('info', `Retrying step (${r + 1}/${retryCount})`);
              await this.sleep(1000);
              try {
                await this.executeAction(step);
                retried = true;
                break;
              } catch (e) {
                // リトライ失敗
              }
            }
            if (!retried) {
              throw error;
            }
            break;
          case 'skip':
            this.log('warn', 'Skipping failed step');
            break;
        }
      }
    }
  }

  private async executeAction(action: Action): Promise<void> {
    const timeout = action.timeout || this.scenario?.settings?.defaultTimeout || 30000;

    switch (action.type) {
      case 'image_click':
      case 'image_double_click':
      case 'image_right_click':
        await this.executeImageClick(action as ImageClickAction, timeout);
        break;
      case 'image_wait':
        await this.executeImageWait(action as ImageWaitAction, timeout);
        break;
      case 'type_text':
        await this.executeTypeText(action as TypeTextAction);
        break;
      case 'key_press':
        await this.executeKeyPress(action as KeyPressAction);
        break;
      case 'key_combo':
        await this.executeKeyCombo(action as KeyComboAction);
        break;
      case 'wait':
        await this.executeWait(action as WaitAction);
        break;
      case 'scroll':
        await this.executeScroll(action as ScrollAction);
        break;
      case 'mouse_move':
        await this.executeMouseMove(action as MouseMoveAction);
        break;
      case 'click_position':
        await this.executeClickPosition(action as ClickPositionAction);
        break;
      case 'condition':
        await this.executeCondition(action as ConditionAction);
        break;
      case 'loop':
        await this.executeLoop(action as LoopAction);
        break;
      case 'set_variable':
        await this.executeSetVariable(action as SetVariableAction);
        break;
      case 'screenshot':
        await this.executeScreenshot(action as ScreenshotAction);
        break;
      case 'log':
        await this.executeLog(action as LogAction);
        break;
      default:
        this.log('warn', `Unknown action type: ${(action as Action).type}`);
    }
  }

  // ========================================
  // 各アクションの実装
  // ========================================

  private async executeImageClick(action: ImageClickAction, timeout: number): Promise<void> {
    const confidence = action.confidence || this.scenario?.settings?.defaultConfidence || 0.5;
    const result = await this.imageRecognizer.waitForImage(
      action.imagePath,
      timeout,
      confidence
    );

    if (!result.found) {
      throw new Error(`Image not found: ${action.imagePath}`);
    }

    const clickX = result.location.x + (action.offsetX || 0);
    const clickY = result.location.y + (action.offsetY || 0);

    this.log('debug', `Image found at (${clickX}, ${clickY}) with confidence ${result.confidence.toFixed(2)}`);

    switch (action.type) {
      case 'image_click':
        await this.inputController.click({ x: clickX, y: clickY });
        break;
      case 'image_double_click':
        await this.inputController.doubleClick({ x: clickX, y: clickY });
        break;
      case 'image_right_click':
        await this.inputController.rightClick({ x: clickX, y: clickY });
        break;
    }
  }

  private async executeImageWait(action: ImageWaitAction, timeout: number): Promise<void> {
    const confidence = action.confidence || 0.5;

    if (action.waitUntilGone) {
      const gone = await this.imageRecognizer.waitUntilImageGone(
        action.imagePath,
        timeout,
        confidence
      );
      if (!gone) {
        throw new Error(`Image still present: ${action.imagePath}`);
      }
    } else {
      const result = await this.imageRecognizer.waitForImage(
        action.imagePath,
        timeout,
        confidence
      );
      if (!result.found) {
        throw new Error(`Image not found: ${action.imagePath}`);
      }
    }
  }

  private async executeTypeText(action: TypeTextAction): Promise<void> {
    const text = this.replaceVariables(action.text);
    await this.inputController.type(text, action.humanLike);
  }

  private async executeKeyPress(action: KeyPressAction): Promise<void> {
    await this.inputController.pressKey(action.key);
  }

  private async executeKeyCombo(action: KeyComboAction): Promise<void> {
    await this.inputController.keyCombo(action.keys);
  }

  private async executeWait(action: WaitAction): Promise<void> {
    let duration = action.duration;

    if (action.randomize && action.randomMin !== undefined && action.randomMax !== undefined) {
      duration = Math.floor(
        Math.random() * (action.randomMax - action.randomMin + 1) + action.randomMin
      );
    }

    this.log('debug', `Waiting for ${duration}ms`);
    await this.sleep(duration);
  }

  private async executeScroll(action: ScrollAction): Promise<void> {
    await this.inputController.scroll(action.direction, action.amount);
  }

  private async executeMouseMove(action: MouseMoveAction): Promise<void> {
    await this.inputController.moveTo({ x: action.x, y: action.y }, action.smooth !== false);
  }

  private async executeClickPosition(action: ClickPositionAction): Promise<void> {
    const point = { x: action.x, y: action.y };
    switch (action.button) {
      case 'right':
        await this.inputController.rightClick(point);
        break;
      case 'middle':
        // middle click not implemented in inputController, use left
        await this.inputController.click(point);
        break;
      default:
        await this.inputController.click(point);
    }
  }

  private async executeCondition(action: ConditionAction): Promise<void> {
    let conditionMet = false;

    switch (action.condition.type) {
      case 'image_exists': {
        const result = await this.imageRecognizer.findImage(
          action.condition.imagePath!,
          action.condition.confidence || 0.5
        );
        conditionMet = result.found;
        break;
      }
      case 'image_not_exists': {
        const result = await this.imageRecognizer.findImage(
          action.condition.imagePath!,
          action.condition.confidence || 0.5
        );
        conditionMet = !result.found;
        break;
      }
      case 'variable_equals': {
        const currentValue = this.state.variables[action.condition.variableName!];
        conditionMet = currentValue === action.condition.variableValue;
        break;
      }
    }

    if (conditionMet && action.thenSteps.length > 0) {
      await this.executeSteps(action.thenSteps);
    } else if (!conditionMet && action.elseSteps && action.elseSteps.length > 0) {
      await this.executeSteps(action.elseSteps);
    }
  }

  private async executeLoop(action: LoopAction): Promise<void> {
    const maxIterations = action.maxIterations || 1000;
    let iteration = 0;

    switch (action.loopType) {
      case 'count':
        const count = typeof action.count === 'string'
          ? parseInt(this.replaceVariables(String(action.count)), 10)
          : action.count || 0;

        for (let i = 0; i < count && iteration < maxIterations; i++) {
          this.state.variables['_loopIndex'] = String(i);
          await this.executeSteps(action.steps);
          iteration++;
        }
        break;

      case 'while_image_exists':
        while (iteration < maxIterations) {
          const result = await this.imageRecognizer.findImage(
            action.imagePath!,
            action.confidence || 0.5
          );
          if (!result.found) break;
          await this.executeSteps(action.steps);
          iteration++;
        }
        break;

      case 'while_image_not_exists':
        while (iteration < maxIterations) {
          const result = await this.imageRecognizer.findImage(
            action.imagePath!,
            action.confidence || 0.5
          );
          if (result.found) break;
          await this.executeSteps(action.steps);
          iteration++;
        }
        break;

      case 'for_each':
        const items = action.items || [];
        for (const item of items) {
          if (iteration >= maxIterations) break;
          if (action.variableName) {
            this.state.variables[action.variableName] = item;
          }
          await this.executeSteps(action.steps);
          iteration++;
        }
        break;
    }

    this.log('debug', `Loop completed after ${iteration} iterations`);
  }

  private async executeSetVariable(action: SetVariableAction): Promise<void> {
    const value = this.replaceVariables(action.value);
    this.state.variables[action.variableName] = value;
    this.log('debug', `Variable set: ${action.variableName} = ${value}`);
  }

  private async executeScreenshot(action: ScreenshotAction): Promise<void> {
    const filename = this.replaceVariables(action.filename);
    const filepath = await this.imageRecognizer.captureScreenToFile(filename);
    this.log('info', `Screenshot saved: ${filepath}`);
  }

  private async executeLog(action: LogAction): Promise<void> {
    const message = this.replaceVariables(action.message);
    this.log(action.level || 'info', message);
  }

  // ========================================
  // ユーティリティ
  // ========================================

  private replaceVariables(text: string): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
      return this.state.variables[varName] || '';
    });
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, stepId?: string): void {
    const logEntry: ExecutionLog = {
      timestamp: new Date(),
      level,
      message,
      stepId,
    };
    this.state.logs.push(logEntry);
    this.emit('log', logEntry);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 画像認識エンジンを取得（テンプレート保存等用）
   */
  getImageRecognizer(): ImageRecognizer {
    return this.imageRecognizer;
  }

  /**
   * 入力コントローラーを取得
   */
  getInputController(): InputController {
    return this.inputController;
  }
}
