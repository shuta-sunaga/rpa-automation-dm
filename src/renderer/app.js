// Image RPA Studio - レンダラーアプリケーション

// グローバル状態
const state = {
  currentScenario: null,
  isExecuting: false,
  steps: [],
  variables: {},
  editingStepIndex: -1,
};

// ========================================
// 初期化
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadScenarioList();
  setupEventListeners();
  setupExecutionListeners();
  createNewScenario();
});

// ========================================
// シナリオ管理
// ========================================

async function loadScenarioList() {
  const list = await window.rpa.scenario.list();
  const container = document.getElementById('scenario-list');
  container.innerHTML = '';

  list.forEach(scenario => {
    const item = document.createElement('div');
    item.className = 'scenario-item';
    item.innerHTML = `
      <div class="scenario-item-name">${scenario.name}</div>
      <div class="scenario-item-date">${formatDate(scenario.updatedAt)}</div>
    `;
    item.addEventListener('click', (e) => loadScenario(scenario.id, e.target));
    container.appendChild(item);
  });
}

async function loadScenario(scenarioId, clickedElement) {
  try {
    const scenario = await window.rpa.scenario.load(scenarioId);
    state.currentScenario = scenario;
    state.steps = scenario.steps || [];
    state.variables = scenario.variables || {};

    document.getElementById('scenario-name').value = scenario.name;
    renderVariables();
    renderSteps();

    // アクティブ状態を更新
    document.querySelectorAll('.scenario-item').forEach(item => {
      item.classList.remove('active');
    });
    if (clickedElement) {
      clickedElement.closest('.scenario-item')?.classList.add('active');
    }

    addLog('info', `Scenario loaded: ${scenario.name}`);
  } catch (error) {
    addLog('error', `Failed to load scenario: ${error.message}`);
  }
}

function createNewScenario() {
  const id = 'scenario-' + Date.now();
  state.currentScenario = {
    id,
    name: '新規シナリオ',
    description: '',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    variables: {},
    steps: [],
    settings: {
      defaultTimeout: 30000,
      defaultConfidence: 0.9,
      screenshotOnError: true,
      stopOnError: false,
    },
  };
  state.steps = [];
  state.variables = {};

  document.getElementById('scenario-name').value = state.currentScenario.name;
  renderVariables();
  renderSteps();
}

async function saveScenario() {
  if (!state.currentScenario) return;

  state.currentScenario.name = document.getElementById('scenario-name').value;
  state.currentScenario.steps = state.steps;
  state.currentScenario.variables = state.variables;

  try {
    await window.rpa.scenario.save(state.currentScenario);
    await loadScenarioList();
    addLog('info', 'Scenario saved');
  } catch (error) {
    addLog('error', `Failed to save: ${error.message}`);
  }
}

// ========================================
// 変数管理
// ========================================

function renderVariables() {
  const container = document.getElementById('variables-list');
  container.innerHTML = '';

  Object.entries(state.variables).forEach(([name, value]) => {
    const item = document.createElement('div');
    item.className = 'variable-item';
    item.innerHTML = `
      <span class="var-name">{{${name}}}</span>
      <span class="var-equals">=</span>
      <input type="text" value="${escapeHtml(value)}" data-var="${name}">
      <button class="btn-remove" data-var="${name}">&times;</button>
    `;
    container.appendChild(item);
  });

  // イベントリスナー
  container.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', (e) => {
      state.variables[e.target.dataset.var] = e.target.value;
    });
  });

  container.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      delete state.variables[e.target.dataset.var];
      renderVariables();
    });
  });
}

function addVariable() {
  const name = prompt('変数名を入力:');
  if (name && !state.variables[name]) {
    state.variables[name] = '';
    renderVariables();
  }
}

// ========================================
// ステップ管理
// ========================================

function renderSteps() {
  const container = document.getElementById('steps-list');
  container.innerHTML = '';

  state.steps.forEach((step, index) => {
    const item = document.createElement('div');
    item.className = 'step-item';
    item.dataset.index = index;
    item.innerHTML = `
      <div class="step-number">${index + 1}</div>
      <div class="step-content">
        <div class="step-type">${getActionLabel(step.type)}</div>
        <div class="step-description">${getStepDescription(step)}</div>
      </div>
      <div class="step-actions">
        <button title="編集" data-action="edit">✏️</button>
        <button title="複製" data-action="duplicate">📋</button>
        <button title="上へ" data-action="up">⬆️</button>
        <button title="下へ" data-action="down">⬇️</button>
        <button title="削除" data-action="delete">🗑️</button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        const action = e.target.dataset.action;
        handleStepAction(action, index);
      } else {
        openStepEditor(index);
      }
    });

    container.appendChild(item);
  });
}

function handleStepAction(action, index) {
  switch (action) {
    case 'edit':
      openStepEditor(index);
      break;
    case 'duplicate':
      const copy = JSON.parse(JSON.stringify(state.steps[index]));
      copy.id = 'step-' + Date.now();
      state.steps.splice(index + 1, 0, copy);
      renderSteps();
      break;
    case 'up':
      if (index > 0) {
        [state.steps[index], state.steps[index - 1]] = [state.steps[index - 1], state.steps[index]];
        renderSteps();
      }
      break;
    case 'down':
      if (index < state.steps.length - 1) {
        [state.steps[index], state.steps[index + 1]] = [state.steps[index + 1], state.steps[index]];
        renderSteps();
      }
      break;
    case 'delete':
      if (confirm('このステップを削除しますか？')) {
        state.steps.splice(index, 1);
        renderSteps();
      }
      break;
  }
}

function addStep(type) {
  const step = createDefaultStep(type);
  state.steps.push(step);
  renderSteps();
  openStepEditor(state.steps.length - 1);
}

function createDefaultStep(type) {
  const base = {
    id: 'step-' + Date.now(),
    type,
    description: '',
    timeout: 30000,
    onError: 'stop',
  };

  switch (type) {
    case 'image_click':
      return { ...base, imagePath: '', confidence: 0.5 };
    case 'type_text':
      return { ...base, text: '', humanLike: true };
    case 'key_press':
      return { ...base, key: 'Enter' };
    case 'wait':
      return { ...base, duration: 1000, randomize: false };
    case 'scroll':
      return { ...base, direction: 'down', amount: 3 };
    case 'loop':
      return { ...base, loopType: 'count', count: 5, steps: [], maxIterations: 100 };
    case 'condition':
      return { ...base, condition: { type: 'image_exists', imagePath: '' }, thenSteps: [], elseSteps: [] };
    default:
      return base;
  }
}

// ========================================
// ステップエディタ
// ========================================

function openStepEditor(index) {
  state.editingStepIndex = index;
  const step = state.steps[index];

  const modal = document.getElementById('step-modal');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');

  title.textContent = `ステップ編集 - ${getActionLabel(step.type)}`;
  body.innerHTML = generateStepForm(step);

  modal.classList.remove('hidden');
}

function generateStepForm(step) {
  let html = `
    <div class="form-group">
      <label>説明</label>
      <input type="text" id="step-description" value="${escapeHtml(step.description || '')}">
    </div>
  `;

  switch (step.type) {
    case 'image_click':
    case 'image_double_click':
    case 'image_right_click':
      html += `
        <div class="form-group">
          <label>テンプレート画像</label>
          <div class="template-header">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-inline-capture">+ 新規キャプチャ</button>
          </div>
          <div id="template-selector" class="template-selector">
            <div class="template-loading">テンプレート読み込み中...</div>
          </div>
          <input type="hidden" id="step-imagePath" value="${escapeHtml(step.imagePath || '')}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>信頼度 (0.0-1.0)</label>
            <input type="number" id="step-confidence" value="${step.confidence || 0.5}" min="0" max="1" step="0.05">
          </div>
          <div class="form-group">
            <label>タイムアウト (ms)</label>
            <input type="number" id="step-timeout" value="${step.timeout || 30000}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>X オフセット</label>
            <input type="number" id="step-offsetX" value="${step.offsetX || 0}">
          </div>
          <div class="form-group">
            <label>Y オフセット</label>
            <input type="number" id="step-offsetY" value="${step.offsetY || 0}">
          </div>
        </div>
      `;
      // テンプレート一覧を非同期で読み込み
      setTimeout(() => {
        loadTemplateSelector(step.imagePath);
        // インラインキャプチャボタンのイベント設定
        document.getElementById('btn-inline-capture')?.addEventListener('click', openInlineCapture);
      }, 0);
      break;

    case 'type_text':
      html += `
        <div class="form-group">
          <label>入力テキスト (変数: {{変数名}})</label>
          <textarea id="step-text" rows="3">${escapeHtml(step.text || '')}</textarea>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="step-humanLike" ${step.humanLike ? 'checked' : ''}>
            人間らしいタイピング
          </label>
        </div>
      `;
      break;

    case 'key_press':
      html += `
        <div class="form-group">
          <label>キー</label>
          <select id="step-key">
            ${['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Space', 'Up', 'Down', 'Left', 'Right', 'F1', 'F2', 'F3', 'F4', 'F5']
              .map(k => `<option value="${k}" ${step.key === k ? 'selected' : ''}>${k}</option>`)
              .join('')}
          </select>
        </div>
      `;
      break;

    case 'wait':
      html += `
        <div class="form-group">
          <label>待機時間 (ms)</label>
          <input type="number" id="step-duration" value="${step.duration || 1000}">
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="step-randomize" ${step.randomize ? 'checked' : ''}>
            ランダム化
          </label>
        </div>
        <div class="form-row" id="random-range" style="${step.randomize ? '' : 'display: none;'}">
          <div class="form-group">
            <label>最小 (ms)</label>
            <input type="number" id="step-randomMin" value="${step.randomMin || 500}">
          </div>
          <div class="form-group">
            <label>最大 (ms)</label>
            <input type="number" id="step-randomMax" value="${step.randomMax || 2000}">
          </div>
        </div>
      `;
      break;

    case 'scroll':
      html += `
        <div class="form-row">
          <div class="form-group">
            <label>方向</label>
            <select id="step-direction">
              ${['up', 'down', 'left', 'right']
                .map(d => `<option value="${d}" ${step.direction === d ? 'selected' : ''}>${d}</option>`)
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label>量</label>
            <input type="number" id="step-amount" value="${step.amount || 3}">
          </div>
        </div>
      `;
      break;

    case 'loop':
      html += `
        <div class="form-group">
          <label>ループタイプ</label>
          <select id="step-loopType">
            <option value="count" ${step.loopType === 'count' ? 'selected' : ''}>回数指定</option>
            <option value="while_image_exists" ${step.loopType === 'while_image_exists' ? 'selected' : ''}>画像が存在する間</option>
            <option value="while_image_not_exists" ${step.loopType === 'while_image_not_exists' ? 'selected' : ''}>画像が存在しない間</option>
          </select>
        </div>
        <div class="form-group" id="loop-count-group">
          <label>回数</label>
          <input type="number" id="step-count" value="${step.count || 5}">
        </div>
        <div class="form-group">
          <label>最大反復回数 (安全装置)</label>
          <input type="number" id="step-maxIterations" value="${step.maxIterations || 100}">
        </div>
        <p style="color: var(--text-secondary); font-size: 0.875rem;">
          ※ ループ内のステップはシナリオ保存後に別途編集してください
        </p>
      `;
      break;

    case 'condition':
      html += `
        <div class="form-group">
          <label>条件タイプ</label>
          <select id="step-conditionType">
            <option value="image_exists" ${step.condition?.type === 'image_exists' ? 'selected' : ''}>画像が存在する</option>
            <option value="image_not_exists" ${step.condition?.type === 'image_not_exists' ? 'selected' : ''}>画像が存在しない</option>
            <option value="variable_equals" ${step.condition?.type === 'variable_equals' ? 'selected' : ''}>変数が一致</option>
          </select>
        </div>
        <p style="color: var(--text-secondary); font-size: 0.875rem;">
          ※ 条件内のステップはシナリオ保存後に別途編集してください
        </p>
      `;
      break;
  }

  html += `
    <div class="form-group">
      <label>エラー時の動作</label>
      <select id="step-onError">
        <option value="stop" ${step.onError === 'stop' ? 'selected' : ''}>停止</option>
        <option value="skip" ${step.onError === 'skip' ? 'selected' : ''}>スキップ</option>
        <option value="retry" ${step.onError === 'retry' ? 'selected' : ''}>リトライ</option>
      </select>
    </div>
  `;

  return html;
}

function saveStepFromModal() {
  const index = state.editingStepIndex;
  if (index < 0) return;

  const step = state.steps[index];

  // 共通フィールド
  step.description = document.getElementById('step-description')?.value || '';
  step.onError = document.getElementById('step-onError')?.value || 'stop';

  // タイプ別フィールド
  switch (step.type) {
    case 'image_click':
    case 'image_double_click':
    case 'image_right_click':
      step.imagePath = document.getElementById('step-imagePath')?.value || '';
      step.confidence = parseFloat(document.getElementById('step-confidence')?.value) || 0.5;
      step.timeout = parseInt(document.getElementById('step-timeout')?.value) || 30000;
      step.offsetX = parseInt(document.getElementById('step-offsetX')?.value) || 0;
      step.offsetY = parseInt(document.getElementById('step-offsetY')?.value) || 0;
      break;

    case 'type_text':
      step.text = document.getElementById('step-text')?.value || '';
      step.humanLike = document.getElementById('step-humanLike')?.checked || false;
      break;

    case 'key_press':
      step.key = document.getElementById('step-key')?.value || 'Enter';
      break;

    case 'wait':
      step.duration = parseInt(document.getElementById('step-duration')?.value) || 1000;
      step.randomize = document.getElementById('step-randomize')?.checked || false;
      step.randomMin = parseInt(document.getElementById('step-randomMin')?.value) || 500;
      step.randomMax = parseInt(document.getElementById('step-randomMax')?.value) || 2000;
      break;

    case 'scroll':
      step.direction = document.getElementById('step-direction')?.value || 'down';
      step.amount = parseInt(document.getElementById('step-amount')?.value) || 3;
      break;

    case 'loop':
      step.loopType = document.getElementById('step-loopType')?.value || 'count';
      step.count = parseInt(document.getElementById('step-count')?.value) || 5;
      step.maxIterations = parseInt(document.getElementById('step-maxIterations')?.value) || 100;
      break;

    case 'condition':
      step.condition = step.condition || {};
      step.condition.type = document.getElementById('step-conditionType')?.value || 'image_exists';
      break;
  }

  renderSteps();
  closeModal('step-modal');
}

async function selectTemplateImage() {
  const filepath = await window.rpa.dialog.openFile({
    title: 'テンプレート画像を選択',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
  });

  if (filepath) {
    document.getElementById('step-imagePath').value = filepath;
  }
}

// インラインキャプチャ（ステップ編集画面から直接キャプチャ）
let inlineCaptureMode = false;

async function openInlineCapture() {
  inlineCaptureMode = true;
  // ステップモーダルを一時的に隠す
  const stepModal = document.getElementById('step-modal');
  stepModal.classList.add('hidden');
  // キャプチャモーダルを開く
  await openCaptureModal();
}

// キャプチャモーダルを閉じる時の処理を更新
function closeCaptureModalAndReturn(savedFilename) {
  closeModal('capture-modal');

  if (inlineCaptureMode) {
    inlineCaptureMode = false;
    // ステップモーダルを再表示
    const stepModal = document.getElementById('step-modal');
    stepModal.classList.remove('hidden');
    // テンプレート一覧を更新して、新しいテンプレートを選択
    if (savedFilename) {
      loadTemplateSelector(savedFilename);
    } else {
      loadTemplateSelector(document.getElementById('step-imagePath')?.value);
    }
  }
}

// テンプレート選択UIを読み込み
async function loadTemplateSelector(currentPath) {
  const container = document.getElementById('template-selector');
  if (!container) return;

  try {
    const templates = await window.rpa.capture.listTemplates();

    if (templates.length === 0) {
      container.innerHTML = `
        <div class="template-empty">
          テンプレートがありません。<br>
          「画面キャプチャ」からテンプレートを作成してください。
        </div>
      `;
      return;
    }

    let html = '<div class="template-grid">';
    templates.forEach(template => {
      const isSelected = currentPath && (currentPath === template.path || currentPath === template.filename || currentPath.endsWith(template.filename));
      html += `
        <div class="template-item ${isSelected ? 'selected' : ''}" data-path="${escapeHtml(template.path)}" data-filename="${escapeHtml(template.filename)}">
          <div class="template-preview">
            <img src="file://${escapeHtml(template.path)}" alt="${escapeHtml(template.name)}">
          </div>
          <div class="template-name">${escapeHtml(template.name)}</div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;

    // クリックイベント設定
    container.querySelectorAll('.template-item').forEach(item => {
      item.addEventListener('click', () => {
        // 選択状態を更新
        container.querySelectorAll('.template-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        // パスを設定
        document.getElementById('step-imagePath').value = item.dataset.filename;
      });
    });

  } catch (error) {
    container.innerHTML = `<div class="template-error">テンプレートの読み込みに失敗しました</div>`;
    console.error('Failed to load templates:', error);
  }
}

// ========================================
// 画面キャプチャ
// ========================================

let captureSelection = { startX: 0, startY: 0, endX: 0, endY: 0, selecting: false };
let currentCaptureBase64 = null; // 現在表示中のキャプチャデータを保存

async function openCaptureModal() {
  const modal = document.getElementById('capture-modal');
  modal.classList.remove('hidden');
  // 選択ボックスをリセット
  document.getElementById('selection-box').classList.add('hidden');
  const templateNameInput = document.getElementById('template-name');
  templateNameInput.value = '';
  await refreshCapture();
  // 入力フィールドにフォーカス
  setTimeout(() => {
    templateNameInput.focus();
  }, 100);
}

async function refreshCapture() {
  addLog('info', 'Capture starting...');
  try {
    const base64 = await window.rpa.capture.screen();
    addLog('info', `Capture returned: ${base64 ? base64.length + ' chars' : 'null/undefined'}`);

    if (!base64) {
      addLog('error', 'Capture returned empty data');
      return;
    }

    // キャプチャデータを保存
    currentCaptureBase64 = base64;

    const img = document.getElementById('capture-image');

    // Image load/error handlers
    img.onload = () => {
      addLog('info', `Image loaded: ${img.naturalWidth}x${img.naturalHeight}`);
    };
    img.onerror = (e) => {
      addLog('error', `Image load error: ${e.type}`);
    };

    img.src = `data:image/png;base64,${base64}`;
    addLog('info', 'Image src set');

    // 選択ボックスをリセット
    document.getElementById('selection-box').classList.add('hidden');
  } catch (error) {
    addLog('error', `Capture failed: ${error.message || error}`);
  }
}

async function saveTemplate() {
  const name = document.getElementById('template-name').value.trim();
  if (!name) {
    alert('テンプレート名を入力してください');
    return;
  }

  if (!currentCaptureBase64) {
    alert('先に画面をキャプチャしてください');
    return;
  }

  const box = document.getElementById('selection-box');
  const img = document.getElementById('capture-image');
  let region = null;

  if (!box.classList.contains('hidden')) {
    // 表示サイズと実際の画像サイズのスケール比率を計算
    const displayWidth = img.clientWidth;
    const displayHeight = img.clientHeight;
    const actualWidth = img.naturalWidth;
    const actualHeight = img.naturalHeight;

    const scaleX = actualWidth / displayWidth;
    const scaleY = actualHeight / displayHeight;

    // 選択範囲を実際の画像座標に変換
    region = {
      x: Math.round(parseInt(box.style.left) * scaleX),
      y: Math.round(parseInt(box.style.top) * scaleY),
      width: Math.round(parseInt(box.style.width) * scaleX),
      height: Math.round(parseInt(box.style.height) * scaleY),
    };

    addLog('info', `Selection: display(${parseInt(box.style.left)},${parseInt(box.style.top)}) -> actual(${region.x},${region.y}), scale(${scaleX.toFixed(2)},${scaleY.toFixed(2)})`);
  }

  try {
    const filepath = await window.rpa.capture.saveTemplateFromData(name, currentCaptureBase64, region);
    addLog('info', `Template saved: ${filepath}`);
    // インラインモードの場合は新しいテンプレートを選択して戻る
    closeCaptureModalAndReturn(name + '.png');
  } catch (error) {
    addLog('error', `Failed to save template: ${error.message}`);
  }
}

// ========================================
// 実行制御
// ========================================

async function executeScenario() {
  if (!state.currentScenario || state.steps.length === 0) {
    alert('実行するステップがありません');
    return;
  }

  state.currentScenario.steps = state.steps;
  state.currentScenario.variables = state.variables;

  try {
    await window.rpa.scenario.execute(state.currentScenario);
    state.isExecuting = true;
    updateExecutionUI();
  } catch (error) {
    addLog('error', `Execution failed: ${error.message}`);
  }
}

async function pauseExecution() {
  await window.rpa.scenario.pause();
}

async function resumeExecution() {
  await window.rpa.scenario.resume();
}

async function stopExecution() {
  await window.rpa.scenario.stop();
  await window.rpa.window.restore();
  state.isExecuting = false;
  updateExecutionUI();
}

function updateExecutionUI() {
  const btnExecute = document.getElementById('btn-execute');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');

  btnExecute.disabled = state.isExecuting;
  btnPause.disabled = !state.isExecuting;
  btnStop.disabled = !state.isExecuting;
}

function setupExecutionListeners() {
  window.rpa.on.executionStateChange((executionState) => {
    const indicator = document.getElementById('status-indicator');
    indicator.className = `status ${executionState.status}`;
    indicator.textContent = getStatusLabel(executionState.status);

    if (executionState.status === 'completed' || executionState.status === 'error' || executionState.status === 'stopped') {
      state.isExecuting = false;
      updateExecutionUI();
    }

    // プログレス更新
    const total = state.steps.length;
    const current = executionState.currentStepIndex + 1;
    document.getElementById('progress-fill').style.width = `${(current / total) * 100}%`;
    document.getElementById('progress-text').textContent = `${current} / ${total}`;
  });

  window.rpa.on.executionStepStart((step) => {
    const currentStepDiv = document.getElementById('current-step');
    currentStepDiv.innerHTML = `
      <strong>${getActionLabel(step.type)}</strong><br>
      ${step.description || getStepDescription(step)}
    `;

    // ステップをアクティブに
    document.querySelectorAll('.step-item').forEach((item, index) => {
      item.classList.remove('active', 'error');
      if (index === state.steps.findIndex(s => s.id === step.id)) {
        item.classList.add('active');
      }
    });
  });

  window.rpa.on.executionStepError(({ step }) => {
    const index = state.steps.findIndex(s => s.id === step.id);
    if (index >= 0) {
      document.querySelectorAll('.step-item')[index]?.classList.add('error');
    }
  });

  window.rpa.on.executionLog((log) => {
    addLog(log.level, log.message);
  });

  window.rpa.on.executionComplete(async (executionState) => {
    // ウィンドウを復元
    await window.rpa.window.restore();

    document.getElementById('current-step').innerHTML = executionState.status === 'completed'
      ? '<span style="color: var(--success);">実行完了</span>'
      : `<span style="color: var(--danger);">${executionState.error || 'エラー'}</span>`;
  });
}

// ========================================
// イベントリスナー
// ========================================

function setupEventListeners() {
  // シナリオ管理
  document.getElementById('btn-new-scenario').addEventListener('click', createNewScenario);
  document.getElementById('btn-save').addEventListener('click', saveScenario);
  document.getElementById('btn-capture').addEventListener('click', openCaptureModal);
  document.getElementById('btn-add-variable').addEventListener('click', addVariable);

  // 実行制御
  document.getElementById('btn-execute').addEventListener('click', executeScenario);
  document.getElementById('btn-pause').addEventListener('click', pauseExecution);
  document.getElementById('btn-stop').addEventListener('click', stopExecution);
  document.getElementById('btn-clear-log').addEventListener('click', clearLog);

  // ステップ追加ボタン
  document.querySelectorAll('.add-step-buttons button').forEach(btn => {
    btn.addEventListener('click', () => addStep(btn.dataset.action));
  });

  // モーダル
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal.id === 'capture-modal') {
        // キャプチャモーダルの場合はインラインモード処理
        closeCaptureModalAndReturn(null);
      } else {
        modal.classList.add('hidden');
      }
    });
  });

  document.getElementById('btn-modal-cancel').addEventListener('click', () => {
    closeModal('step-modal');
  });

  document.getElementById('btn-modal-save').addEventListener('click', saveStepFromModal);

  // キャプチャモーダル
  document.getElementById('btn-refresh-capture').addEventListener('click', refreshCapture);
  document.getElementById('btn-save-template').addEventListener('click', saveTemplate);

  // 画像選択（ドラッグ）
  const captureImage = document.getElementById('capture-image');
  const selectionBox = document.getElementById('selection-box');

  // 画像のドラッグを無効化
  captureImage.addEventListener('dragstart', (e) => {
    e.preventDefault();
  });

  captureImage.addEventListener('mousedown', (e) => {
    e.preventDefault(); // デフォルトのドラッグを防止
    const rect = captureImage.getBoundingClientRect();
    captureSelection.startX = e.clientX - rect.left;
    captureSelection.startY = e.clientY - rect.top;
    captureSelection.selecting = true;
    selectionBox.classList.remove('hidden');
  });

  captureImage.addEventListener('mousemove', (e) => {
    if (!captureSelection.selecting) return;
    const rect = captureImage.getBoundingClientRect();
    captureSelection.endX = e.clientX - rect.left;
    captureSelection.endY = e.clientY - rect.top;

    const x = Math.min(captureSelection.startX, captureSelection.endX);
    const y = Math.min(captureSelection.startY, captureSelection.endY);
    const width = Math.abs(captureSelection.endX - captureSelection.startX);
    const height = Math.abs(captureSelection.endY - captureSelection.startY);

    selectionBox.style.left = `${x}px`;
    selectionBox.style.top = `${y}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
  });

  captureImage.addEventListener('mouseup', () => {
    captureSelection.selecting = false;
  });

  // 待機時間のランダム化トグル
  document.addEventListener('change', (e) => {
    if (e.target.id === 'step-randomize') {
      const rangeDiv = document.getElementById('random-range');
      if (rangeDiv) {
        rangeDiv.style.display = e.target.checked ? 'flex' : 'none';
      }
    }
  });
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
  state.editingStepIndex = -1;
}

// ========================================
// ログ
// ========================================

function addLog(level, message) {
  const container = document.getElementById('log-container');
  const entry = document.createElement('div');
  entry.className = `log-entry ${level}`;
  entry.innerHTML = `<span class="log-time">${formatTime(new Date())}</span>${escapeHtml(message)}`;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

function clearLog() {
  document.getElementById('log-container').innerHTML = '';
}

// ========================================
// ユーティリティ
// ========================================

function getActionLabel(type) {
  const labels = {
    'image_click': '画像クリック',
    'image_double_click': '画像ダブルクリック',
    'image_right_click': '画像右クリック',
    'image_wait': '画像待機',
    'type_text': 'テキスト入力',
    'key_press': 'キー押下',
    'key_combo': 'キーコンボ',
    'wait': '待機',
    'scroll': 'スクロール',
    'mouse_move': 'マウス移動',
    'click_position': '座標クリック',
    'condition': '条件分岐',
    'loop': 'ループ',
    'set_variable': '変数設定',
    'screenshot': 'スクリーンショット',
    'log': 'ログ出力',
  };
  return labels[type] || type;
}

function getStepDescription(step) {
  switch (step.type) {
    case 'image_click':
    case 'image_double_click':
    case 'image_right_click':
      return step.imagePath ? `画像: ${step.imagePath.split(/[/\\]/).pop()}` : '(画像未設定)';
    case 'type_text':
      return step.text ? `"${step.text.substring(0, 30)}${step.text.length > 30 ? '...' : ''}"` : '(テキスト未設定)';
    case 'key_press':
      return `キー: ${step.key}`;
    case 'wait':
      return `${step.duration}ms`;
    case 'scroll':
      return `${step.direction} x ${step.amount}`;
    case 'loop':
      return `${step.loopType === 'count' ? step.count + '回' : step.loopType}`;
    case 'condition':
      return step.condition?.type || '条件未設定';
    default:
      return step.description || '';
  }
}

function getStatusLabel(status) {
  const labels = {
    'idle': '待機中',
    'running': '実行中',
    'paused': '一時停止',
    'stopped': '停止',
    'completed': '完了',
    'error': 'エラー',
  };
  return labels[status] || status;
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('ja-JP');
}

function formatTime(date) {
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
