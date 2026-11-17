import * as THREE from '../../lib/three.module.js';

/**
 * 古代战舰/大明宝船载具 (Treasure Ship / Warship)
 * 具备四点波浪浮力探针、物理俯仰横摇模拟、航海大惯性力学与龙旗硬帆构造
 */
export class Ship {
  constructor(scene, ocean) {
    this.scene = scene;
    this.ocean = ocean;

    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.heading = 0; // 航向偏航角

    // 航海物理参数
    this.speed = 0;
    this.maxSpeed = 18.0;     // 最高航速 18 节
    this.boostSpeed = 24.0;   // 顺风满帆航速
    this.acceleration = 4.5;  // 船体重，加速具有明显惯性
    this.deceleration = 2.8;
    this.rudderAngle = 0;     // 当前舵角
    this.maxRudderAngle = 0.45;
    this.turnRate = 0.65;

    // 四点浮力探针偏移 (米)
    this.probes = {
      bow: new THREE.Vector3(0, 0, 10.5),     // 船首
      stern: new THREE.Vector3(0, 0, -10.5),  // 船尾
      port: new THREE.Vector3(-3.8, 0, 0),    // 左舷
      starboard: new THREE.Vector3(3.8, 0, 0) // 右舷
    };

    this.isActive = false;

    this.initModel();
    this.initBowWaveParticles();
  }

  initModel() {
    this.group = new THREE.Group();

    // 材质
    const hullWoodMat = new THREE.MeshStandardMaterial({
      color: 0x5c3d28,
      roughness: 0.85,
      metalness: 0.05
    });

    const deckWoodMat = new THREE.MeshStandardMaterial({
      color: 0x825b38,
      roughness: 0.75
    });

    const sailMat = new THREE.MeshStandardMaterial({
      color: 0xdcd0b8, // 传统米黄色亚麻硬帆
      roughness: 0.9,
      side: THREE.DoubleSide
    });

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.35,
      metalness: 0.85
    });

    const redMat = new THREE.MeshStandardMaterial({
      color: 0xa8201a,
      roughness: 0.6
    });

    // 1. 主船体 (长 22m, 宽 7.6m, 深 5.2m)
    const hullGeo = new THREE.BoxGeometry(7.6, 4.5, 22);
    const hull = new THREE.Mesh(hullGeo, hullWoodMat);
    hull.position.y = 1.6;
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.group.add(hull);

    // 船头尖角削形 (Bow)
    const bowGeo = new THREE.ConeGeometry(4.2, 7.5, 4);
    bowGeo.rotateZ(Math.PI / 4);
    bowGeo.rotateX(-Math.PI / 2);
    const bow = new THREE.Mesh(bowGeo, hullWoodMat);
    bow.position.set(0, 1.8, 13.5);
    bow.castShadow = true;
    this.group.add(bow);

    // 2. 艉楼多层建筑 (Stern Castle - 明代福船标志性高耸艉楼)
    const sternCastleGeo = new THREE.BoxGeometry(7.2, 3.8, 6.5);
    const sternCastle = new THREE.Mesh(sternCastleGeo, redMat);
    sternCastle.position.set(0, 5.2, -8.0);
    sternCastle.castShadow = true;
    this.group.add(sternCastle);

    // 艉楼顶部飞檐顶盖
    const roofGeo = new THREE.ConeGeometry(5.8, 1.8, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(roofGeo, goldMat);
    roof.position.set(0, 7.8, -8.0);
    this.group.add(roof);

    // 3. 甲板与护栏
    const deckGeo = new THREE.BoxGeometry(7.4, 0.4, 18);
    const deck = new THREE.Mesh(deckGeo, deckWoodMat);
    deck.position.set(0, 3.8, 0);
    deck.receiveShadow = true;
    this.group.add(deck);

    // 4. 三根宏伟桅杆与硬帆 (Fore, Main, Mizzen Mast)
    const mastConfigs = [
      { z: 6.5, height: 16, sailWidth: 6.8, sailHeight: 9.5 },  // 前桅
      { z: 0.0, height: 21, sailWidth: 8.5, sailHeight: 13.0 }, // 主桅
      { z: -5.5, height: 14, sailWidth: 5.5, sailHeight: 8.0 }  // 后桅
    ];

    mastConfigs.forEach(cfg => {
      const mastGeo = new THREE.CylinderGeometry(0.28, 0.45, cfg.height, 8);
      const mast = new THREE.Mesh(mastGeo, hullWoodMat);
      mast.position.set(0, cfg.height / 2 + 3.8, cfg.z);
      mast.castShadow = true;
      this.group.add(mast);

      // 中式硬帆 (带有横向竹条肋骨纹理)
      const sailGeo = new THREE.PlaneGeometry(cfg.sailWidth, cfg.sailHeight, 4, 6);
      const sail = new THREE.Mesh(sailGeo, sailMat);
      sail.position.set(0, cfg.height * 0.55 + 3.8, cfg.z + 0.3);
      sail.castShadow = true;
      this.group.add(sail);

      // 桅顶大明战旗
      const flagGeo = new THREE.PlaneGeometry(3.5, 1.8);
      const flag = new THREE.Mesh(flagGeo, redMat);
      flag.position.set(0, cfg.height + 4.2, cfg.z);
      flag.rotation.y = Math.PI / 2;
      this.group.add(flag);
    });

    // 舵位平台与舵轮
    const helmGeo = new THREE.TorusGeometry(0.8, 0.08, 6, 12);
    const helm = new THREE.Mesh(helmGeo, goldMat);
    helm.position.set(0, 7.6, -5.2);
    this.group.add(helm);
    this.helm = helm;

    this.group.visible = false;
    this.scene.add(this.group);
  }

  initBowWaveParticles() {
    // 船头破浪白色翻滚浪花
    const count = 120;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    this.bowParticles = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100;
      positions[i * 3 + 2] = 0;
      this.bowParticles.push({
        pos: new THREE.Vector3(0, -100, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.8 + Math.random() * 0.5
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xe6f4f8,
      size: 1.4,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.bowWaveMesh = new THREE.Points(geometry, material);
    this.scene.add(this.bowWaveMesh);
  }

  activate(spawnPosition, spawnHeading) {
    this.isActive = true;
    this.position.copy(spawnPosition);
    this.heading = spawnHeading;
    this.speed = 2.0;
    this.group.visible = true;
    this.bowWaveMesh.visible = true;
  }

  deactivate() {
    this.isActive = false;
    this.group.visible = false;
    this.bowWaveMesh.visible = false;
    this.speed = 0;
  }

  update(delta, input, time) {
    if (!this.isActive) return;

    const move = input.getMovementVector();

    // 加速与落帆惯性计算
    let targetSpeed = 0;
    if (move.forward > 0) {
      targetSpeed = move.sprint ? this.boostSpeed : this.maxSpeed;
    } else if (move.forward < 0) {
      targetSpeed = -4.5; // 倒退
    }

    if (targetSpeed > this.speed) {
      this.speed = Math.min(this.speed + this.acceleration * delta, targetSpeed);
    } else {
      this.speed = Math.max(this.speed - this.deceleration * delta, targetSpeed);
    }

    // 舵角控制与转弯半径
    if (move.right !== 0) {
      const steer = -move.right;
      this.rudderAngle = THREE.MathUtils.lerp(this.rudderAngle, steer * this.maxRudderAngle, delta * 4.0);
    } else {
      this.rudderAngle = THREE.MathUtils.lerp(this.rudderAngle, 0, delta * 3.0);
    }

    // 航向转动依赖船只前向速度（速度为0时舵效大幅衰减）
    const rudderEffectiveness = Math.min(Math.abs(this.speed) / 6.0, 1.0);
    this.heading += this.rudderAngle * this.turnRate * rudderEffectiveness * delta;

    // 舵轮旋转动画
    if (this.helm) {
      this.helm.rotation.z = -this.rudderAngle * 3.0;
    }

    // 水平航行位移推进
    this.position.x += Math.sin(this.heading) * this.speed * delta;
    this.position.z += Math.cos(this.heading) * this.speed * delta;

    // 四点波浪浮力探针：计算船体在波浪中的俯仰 (Pitch)、横摇 (Roll) 与平均升沉 (Heave)
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);

    const getProbeWorld = (probeLocal) => {
      return {
        x: this.position.x + cosH * probeLocal.x + sinH * probeLocal.z,
        z: this.position.z - sinH * probeLocal.x + cosH * probeLocal.z
      };
    };

    const pBow = getProbeWorld(this.probes.bow);
    const pStern = getProbeWorld(this.probes.stern);
    const pPort = getProbeWorld(this.probes.port);
    const pStarboard = getProbeWorld(this.probes.starboard);

    const hBow = this.ocean.getWaterHeight(pBow.x, pBow.z, time);
    const hStern = this.ocean.getWaterHeight(pStern.x, pStern.z, time);
    const hPort = this.ocean.getWaterHeight(pPort.x, pPort.z, time);
    const hStarboard = this.ocean.getWaterHeight(pStarboard.x, pStarboard.z, time);

    // 浮沉升降高度 (吃水线深度约 -1.2m)
    const avgWaveHeight = (hBow + hStern + hPort + hStarboard) * 0.25;
    this.position.y = avgWaveHeight - 0.4;

    // 俯仰角 (前倾 / 后仰)
    const pitch = (hBow - hStern) / 21.0;

    // 横摇角 (左右侧倾) + 转弯离心横侧倾 (Heeling)
    const waveRoll = (hStarboard - hPort) / 7.6;
    const steerRoll = -this.rudderAngle * (this.speed / this.maxSpeed) * 0.22;
    const roll = waveRoll + steerRoll;

    // 更新船只整体位置与姿态欧拉角
    this.group.position.copy(this.position);
    this.group.rotation.set(pitch, this.heading, roll, 'YXZ');

    // 更新船头破浪水花粒子
    this._updateBowWave(delta, pBow);
  }

  _updateBowWave(delta, pBow) {
    if (this.speed < 2.0) return;

    const positions = this.bowWaveMesh.geometry.attributes.position.array;
    const count = this.bowParticles.length;

    // 每次更新发射 3 个船头浪花
    for (let k = 0; k < 3; k++) {
      const idx = Math.floor(Math.random() * count);
      const p = this.bowParticles[idx];

      const side = Math.random() > 0.5 ? 1 : -1;
      p.pos.set(
        pBow.x + (Math.random() - 0.5) * 2.0,
        this.position.y + 0.8,
        pBow.z + (Math.random() - 0.5) * 2.0
      );

      p.vel.set(
        side * (2.5 + Math.random() * 3.5),
        1.8 + Math.random() * 2.5,
        (Math.random() - 0.5) * 3.0
      );
      p.life = 0;
    }

    for (let i = 0; i < count; i++) {
      const p = this.bowParticles[i];
      p.life += delta;
      if (p.life < p.maxLife) {
        p.pos.addScaledVector(p.vel, delta);
        p.vel.y -= 9.8 * delta;
        positions[i * 3] = p.pos.x;
        positions[i * 3 + 1] = p.pos.y;
        positions[i * 3 + 2] = p.pos.z;
      } else {
        positions[i * 3 + 1] = -100;
      }
    }

    this.bowWaveMesh.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.bowWaveMesh);
  }
}
