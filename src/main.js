import * as THREE from '../lib/three.module.js';
import { Engine } from './core/Engine.js';
import { InputManager } from './core/Input.js';
import { Ocean } from './ocean/Ocean.js';
import { Sky } from './sky/Sky.js';
import { Terrain } from './world/Terrain.js';
import { Dock } from './world/Dock.js';
import { Player } from './entities/Player.js';
import { Skateboard } from './entities/Skateboard.js';
import { Ship } from './entities/Ship.js';
import { Minimap } from './ui/Minimap.js';
import { HUD } from './ui/HUD.js';
import { SoundSynth } from './audio/SoundSynth.js';

/**
 * 游戏主入口控制器 (GameController)
 * 统筹全局状态机（陆地徒步、水上滑板、大明战船）与全系统渲染循环
 */
class Game {
  constructor() {
    this.mode = 'foot'; // 'foot' | 'skateboard' | 'ship'

    this.init();
  }

  init() {
    // 1. 初始化引擎与输入
    this.engine = new Engine(document.getElementById('game-container'));
    this.input = new InputManager(this.engine.renderer.domElement);

    // 2. 初始化天空与光照
    this.sky = new Sky(this.engine.scene);

    // 3. 初始化物理海洋与高度场
    this.ocean = new Ocean(this.engine.scene, this.sky.sunLight);

    // 4. 初始化大地图陆地群岛与官澳码头
    this.terrain = new Terrain(this.engine.scene);
    this.dock = new Dock(this.engine.scene);

    // 5. 初始化主角与载具
    this.player = new Player(this.engine.scene, this.terrain, this.dock);
    this.skateboard = new Skateboard(this.engine.scene, this.ocean);
    this.ship = new Ship(this.engine.scene, this.ocean);

    // 6. 初始化界面系统与算法音频
    this.minimap = new Minimap(this.terrain, this.dock);
    this.hud = new HUD();
    this.sound = new SoundSynth();

    // 7. 注册动作按键监听
    this.setupKeybindings();

    // 8. 启动主循环
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupKeybindings() {
    // 按 M 键：切换大明全景航海图
    this.input.onAction('KeyM', () => {
      this.minimap.toggleFullMap();
    });

    // 按 X 键：在海面上切换水上滑板冲浪
    this.input.onAction('KeyX', () => {
      this.toggleSkateboard();
    });

    // 按 S 键：在海面上召唤/驾驶古代战船
    this.input.onAction('KeyS', () => {
      this.toggleShip();
    });
  }

  /**
   * 切换水上滑板 (按 X)
   */
  toggleSkateboard() {
    if (this.mode === 'skateboard') {
      // 收起滑板，返回徒步形态
      this.mode = 'foot';
      this.skateboard.deactivate();
      this.player.position.copy(this.skateboard.position);
      this.player.rotationY = this.skateboard.heading;
      this.player.setVisible(true);
      this.hud.showNotification('已收起水上滑板，切换为踏水/徒步形态。');
      this.sound.playChime(false);
    } else {
      // 检查当前是否位于水面或码头边缘
      const currentPos = this.mode === 'ship' ? this.ship.position : this.player.position;
      const currentHeading = this.mode === 'ship' ? this.ship.heading : this.player.rotationY;

      // 如果在陆地过高处则提示靠近海面
      const terrainH = this.terrain.getTerrainHeight(currentPos.x, currentPos.z);
      if (terrainH > 3.0 && !this.player.isOnDock) {
        this.hud.showNotification('⚠️ 水上滑板需要在海面或浅滩使用，请移动靠近水边！');
        return;
      }

      if (this.mode === 'ship') {
        this.ship.deactivate();
      }

      this.mode = 'skateboard';
      this.player.setVisible(false);
      this.skateboard.activate(currentPos, currentHeading);
      this.hud.showNotification('🏄‍♂️ 已踏上水上滑板！按 <b>W/A/S/D</b> 极速冲浪，<b>Shift</b> 喷射推进！');
      this.sound.playChime(false);
    }
  }

  /**
   * 切换召唤战船 (按 S)
   */
  toggleShip() {
    if (this.mode === 'ship') {
      // 收回战船，返回滑板或人物
      this.mode = 'skateboard';
      this.ship.deactivate();
      this.skateboard.activate(this.ship.position, this.ship.heading);
      this.hud.showNotification('已停靠收回战船，切换至轻便水上滑板。');
      this.sound.playChime(true);
    } else {
      // 获取当前玩家/滑板位置
      const currentPos = this.mode === 'skateboard' ? this.skateboard.position : this.player.position;
      const currentHeading = this.mode === 'skateboard' ? this.skateboard.heading : this.player.rotationY;

      // 检查水深条件 (战船吃水较深，需要水深足够的开阔海域或泊位)
      const terrainH = this.terrain.getTerrainHeight(currentPos.x, currentPos.z);
      if (terrainH > 2.0 && !this.player.isOnDock) {
        this.hud.showNotification('⚠️ 战船吨位宏大，请移步至码头泊位或开阔深海域再行召唤！');
        return;
      }

      if (this.mode === 'skateboard') {
        this.skateboard.deactivate();
      }
      this.player.setVisible(false);

      this.mode = 'ship';
      this.ship.activate(currentPos, currentHeading);
      this.hud.showNotification('⛵ 赫赫皇威！大明战船已召唤出海！按 <b>W/A/S/D</b> 掌舵扬帆起航！');
      this.sound.playChime(true);
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    const delta = Math.min(this.engine.clock.getDelta(), 0.1);
    const time = this.ocean.time;

    // 1. 更新环境与水体
    this.ocean.update(delta, this.engine.camera);
    this.sky.update(delta, this.engine.camera);
    this.dock.update(delta);

    // 2. 状态机推进：更新当前活动载具或人物
    let activePosition = this.player.position;
    let activeHeading = this.player.rotationY;
    let currentSpeed = this.player.speed;
    let recommendedDistance = 8.5;
    let modeLabel = '徒步';

    if (this.mode === 'ship') {
      this.ship.update(delta, this.input, time);
      activePosition = this.ship.position;
      activeHeading = this.ship.heading;
      currentSpeed = this.ship.speed;
      recommendedDistance = 28.0; // 战船机位拉远以获得宏伟视角
      modeLabel = '战船';
    } else if (this.mode === 'skateboard') {
      this.skateboard.update(delta, this.input, time);
      activePosition = this.skateboard.position;
      activeHeading = this.skateboard.heading;
      currentSpeed = this.skateboard.speed;
      recommendedDistance = 11.0;
      modeLabel = '滑板';
    } else {
      // 陆地徒步模式：移动基于摄像机偏航角计算
      const camYaw = this.engine.cameraController.yaw;
      this.player.update(delta, this.input, camYaw);
      activePosition = this.player.position;
      activeHeading = this.player.rotationY;
      currentSpeed = this.player.speed;
      recommendedDistance = 8.5;
      modeLabel = '徒步';
    }

    // 3. 摄像机跟随目标
    this.engine.updateCamera(activePosition, this.input.mouse, delta, recommendedDistance);

    // 4. 更新界面系统 (小地图与 HUD)
    this.minimap.update(activePosition, activeHeading, currentSpeed, modeLabel);
    this.hud.update(this.mode, currentSpeed, this.player.isInWater, this.player.isOnDock);

    // 5. 更新算法音频
    this.sound.update(currentSpeed, this.mode !== 'foot' || this.player.isInWater);

    // 6. 清理帧内输入增量
    this.input.update();

    // 7. 执行渲染
    this.engine.render();
  }
}

// 启动游戏
window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new Game();
});
