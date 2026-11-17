import * as THREE from '../../lib/three.module.js';

/**
 * 引擎核心 (Engine)
 * 统一调度场景、高画质渲染器、第三人称弹簧臂追踪摄像机与渲染循环
 */
export class Engine {
  constructor(container) {
    this.container = container || document.body;

    // 1. 基础场景与时钟
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();

    // 2. 摄像机
    this.camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / window.innerHeight,
      0.2,
      5000
    );

    // 3. 高性能 WebGL 渲染器
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // 4. 弹簧臂跟随摄像机控制器
    this.cameraController = {
      targetPos: new THREE.Vector3(75, 3.2, 0),
      yaw: -Math.PI / 2,     // 水平旋转角
      pitch: 0.28,           // 俯仰角 (弧度)
      distance: 8.5,         // 目标机位距离
      minDistance: 3.5,
      maxDistance: 45.0,
      currentPos: new THREE.Vector3(75, 5, 10),
      lookTarget: new THREE.Vector3(75, 3.2, 0)
    };

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * 更新第三人称摄像机机位
   * @param {THREE.Vector3} targetPosition 追踪目标世界位置
   * @param {object} mouseInput 鼠标输入 { deltaX, deltaY, wheel }
   * @param {number} delta 帧耗时
   * @param {number} modeDistance 针对不同载具推荐的基础视距（船只更大，人物更近）
   */
  updateCamera(targetPosition, mouseInput, delta, modeDistance = 8.5) {
    const c = this.cameraController;

    // 鼠标拖拽控制机位旋转
    const rotSpeed = 0.0035;
    c.yaw -= mouseInput.deltaX * rotSpeed;
    c.pitch = Math.max(0.05, Math.min(Math.PI / 2.3, c.pitch + mouseInput.deltaY * rotSpeed));

    // 滚轮缩放
    c.distance = Math.max(c.minDistance, Math.min(c.maxDistance, c.distance + mouseInput.wheel));
    c.distance = THREE.MathUtils.lerp(c.distance, modeDistance, delta * 3.0);

    // 计算摄像机目标物理坐标
    const cosPitch = Math.cos(c.pitch);
    const sinPitch = Math.sin(c.pitch);
    const offsetX = Math.sin(c.yaw) * cosPitch * c.distance;
    const offsetZ = Math.cos(c.yaw) * cosPitch * c.distance;
    const offsetY = sinPitch * c.distance + 1.6;

    const desiredCamPos = new THREE.Vector3(
      targetPosition.x + offsetX,
      targetPosition.y + offsetY,
      targetPosition.z + offsetZ
    );

    // 平滑插值摄像机位置与注视点
    c.currentPos.lerp(desiredCamPos, Math.min(1.0, delta * 8.0));
    c.lookTarget.lerp(new THREE.Vector3(targetPosition.x, targetPosition.y + 1.8, targetPosition.z), Math.min(1.0, delta * 12.0));

    this.camera.position.copy(c.currentPos);
    this.camera.lookAt(c.lookTarget);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
