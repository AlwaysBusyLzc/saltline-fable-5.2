/**
 * 输入管理器 (InputManager)
 * 负责键盘、鼠标交互监听及按键状态分发
 */
export class InputManager {
  constructor(domElement) {
    this.domElement = domElement || document.body;
    this.keys = {};
    this.prevKeys = {};

    // 鼠标与视角控制
    this.mouse = {
      isDown: false,
      deltaX: 0,
      deltaY: 0,
      wheel: 0
    };

    // 单次按键触发回调集合
    this.actionListeners = new Map();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onWheel = this._onWheel.bind(this);

    this.init();
  }

  init() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.domElement.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    this.domElement.addEventListener('wheel', this._onWheel, { passive: false });
  }

  _onKeyDown(e) {
    const code = e.code;
    if (!this.keys[code]) {
      // 触发单次点击事件
      const listeners = this.actionListeners.get(code);
      if (listeners) {
        listeners.forEach(fn => fn());
      }
    }
    this.keys[code] = true;
  }

  _onKeyUp(e) {
    this.keys[e.code] = false;
  }

  _onMouseDown(e) {
    if (e.button === 0 || e.button === 2) {
      this.mouse.isDown = true;
    }
  }

  _onMouseUp() {
    this.mouse.isDown = false;
  }

  _onMouseMove(e) {
    if (this.mouse.isDown || document.pointerLockElement === this.domElement) {
      this.mouse.deltaX += e.movementX || 0;
      this.mouse.deltaY += e.movementY || 0;
    }
  }

  _onWheel(e) {
    e.preventDefault();
    this.mouse.wheel += Math.sign(e.deltaY) * 1.5;
  }

  /**
   * 注册单次触发按键动作 (例如 'KeyM', 'KeyX', 'KeyS')
   */
  onAction(code, callback) {
    if (!this.actionListeners.has(code)) {
      this.actionListeners.set(code, []);
    }
    this.actionListeners.get(code).push(callback);
  }

  isKeyDown(code) {
    return !!this.keys[code];
  }

  /**
   * 获取标准化移动向量 { forward: number, right: number }
   */
  getMovementVector() {
    let forward = 0;
    let right = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) forward += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) forward -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) right += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) right -= 1;

    return { forward, right, sprint: !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'] };
  }

  /**
   * 在每帧结束时重置每帧累积的增量
   */
  update() {
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
    this.mouse.wheel = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.domElement.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.domElement.removeEventListener('wheel', this._onWheel);
  }
}
