/**
 * 游戏 HUD 状态面板与按键指南系统
 */
export class HUD {
  constructor() {
    this.initDOM();
  }

  initDOM() {
    const hudContainer = document.createElement('div');
    hudContainer.id = 'game-hud';
    hudContainer.innerHTML = `
      <!-- 准星 -->
      <div class="hud-crosshair"></div>

      <!-- 顶部通知横幅 -->
      <div id="hud-banner" class="hud-banner">
        已就绪：探索大明海陆大世界。靠近水面按 <b>X</b> 踏上水上滑板，按 <b>S</b> 召唤战船出海！
      </div>

      <!-- 左下角状态徽章与航速计 -->
      <div class="hud-status-card">
        <div class="status-mode-badge" id="hud-mode-badge">
          <span class="badge-icon">🏃</span>
          <span class="badge-title" id="hud-mode-text">陆地徒步</span>
        </div>
        <div class="status-speed-row">
          <span class="speed-num" id="hud-speed-num">0.0</span>
          <span class="speed-unit">节 (Knots)</span>
        </div>
        <div class="vehicle-controls-prompt" id="hud-prompt-text">
          提示：已在陆地，移动靠近水面即可下海
        </div>
      </div>

      <!-- 右下角快捷键指引 -->
      <div class="hud-keybinds-panel">
        <div class="keybind-item"><span class="key-badge">W A S D</span> 移动 / 航向转向</div>
        <div class="keybind-item"><span class="key-badge">Shift</span> 疾跑 / 满帆冲刺</div>
        <div class="keybind-item highlight"><span class="key-badge">X</span> 水上滑板 (海面冲浪)</div>
        <div class="keybind-item highlight"><span class="key-badge">S</span> 召唤 / 驾驶战船 (出海)</div>
        <div class="keybind-item"><span class="key-badge">M</span> 切换大明航海图</div>
        <div class="keybind-item"><span class="key-badge">鼠标拖拽</span> 旋转视角 / 滚轮缩放</div>
      </div>
    `;
    document.body.appendChild(hudContainer);

    this.modeText = document.getElementById('hud-mode-text');
    this.modeBadge = document.getElementById('hud-mode-badge');
    this.speedNum = document.getElementById('hud-speed-num');
    this.promptText = document.getElementById('hud-prompt-text');
    this.banner = document.getElementById('hud-banner');
  }

  showNotification(msg, duration = 4000) {
    if (!this.banner) return;
    this.banner.innerHTML = msg;
    this.banner.style.opacity = '1';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      this.banner.style.opacity = '0.4';
    }, duration);
  }

  update(mode, speedKnots, isInWater, isOnDock) {
    const knots = (speedKnots * 1.94384).toFixed(1);
    this.speedNum.innerText = knots;

    if (mode === 'ship') {
      this.modeBadge.className = 'status-mode-badge mode-ship';
      this.modeBadge.querySelector('.badge-icon').innerText = '⛵';
      this.modeText.innerText = '大明战船驾驶';
      this.promptText.innerHTML = '已在掌舵：按 <b>S</b> 收起战船，按 <b>X</b> 换乘滑板';
    } else if (mode === 'skateboard') {
      this.modeBadge.className = 'status-mode-badge mode-board';
      this.modeBadge.querySelector('.badge-icon').innerText = '🏄';
      this.modeText.innerText = '水上滑板冲浪';
      this.promptText.innerHTML = '极速滑行：按 <b>X</b> 收起滑板，按 <b>S</b> 召唤战船';
    } else {
      this.modeBadge.className = 'status-mode-badge mode-foot';
      this.modeBadge.querySelector('.badge-icon').innerText = '🏃';
      this.modeText.innerText = isInWater ? '海面涉水' : (isOnDock ? '码头栈桥' : '陆地探索');
      if (isInWater) {
        this.promptText.innerHTML = '处于海面：按 <b>X</b> 使用水上滑板，按 <b>S</b> 召唤战船';
      } else {
        this.promptText.innerHTML = '处于陆地：按 <b>W/A/S/D</b> 移动，前往码头或海边';
      }
    }
  }
}
