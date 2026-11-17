import * as THREE from '../../lib/three.module.js';

/**
 * 水上滑板载具 (Water Skateboard / Surfboard)
 * 经典《新郑和下西洋》水上高速灵动机动载具
 * 具备贴浪波形倾角解算、极速冲浪转向倾角与水花尾流粒子
 */
export class Skateboard {
  constructor(scene, ocean) {
    this.scene = scene;
    this.ocean = ocean;

    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.heading = 0; // 当前朝向偏航角

    this.speed = 0;
    this.maxSpeed = 26.0;
    this.boostSpeed = 38.0;
    this.acceleration = 18.0;
    this.deceleration = 10.0;
    this.turnSpeed = 2.4;
    this.bankAngle = 0; // 转向倾侧角

    this.isActive = false;

    this.initModel();
    this.initWakeParticles();
  }

  initModel() {
    this.group = new THREE.Group();

    // 滑板板身流线型复合几何体
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0x0a9396,
      roughness: 0.2,
      metalness: 0.6
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xee9b00,
      roughness: 0.3,
      metalness: 0.8
    });

    const padMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.9
    });

    // 主板身 (长 2.8m, 宽 0.85m, 厚 0.12m)
    const boardGeo = new THREE.BoxGeometry(0.85, 0.12, 2.8);
    // 前端前翘 (Rocker)
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.y = 0.06;
    board.castShadow = true;
    this.group.add(board);

    // 防滑脚垫
    const padFront = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.9), padMat);
    padFront.position.set(0, 0.13, 0.5);
    board.add(padFront);

    const padBack = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.9), padMat);
    padBack.position.set(0, 0.13, -0.6);
    board.add(padBack);

    // 尾部双水翼导流鳍 (Hydrofoil Fins)
    const finGeo = new THREE.BoxGeometry(0.06, 0.32, 0.45);
    const finL = new THREE.Mesh(finGeo, trimMat);
    finL.position.set(-0.32, -0.15, -1.1);
    finL.rotation.z = 0.2;
    board.add(finL);

    const finR = new THREE.Mesh(finGeo, trimMat);
    finR.position.set(0.32, -0.15, -1.1);
    finR.rotation.z = -0.2;
    board.add(finR);

    // 板底水流发光侧翼
    const glowGeo = new THREE.BoxGeometry(0.88, 0.02, 2.84);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = -0.05;
    board.add(glow);

    this.group.visible = false;
    this.scene.add(this.group);
  }

  initWakeParticles() {
    // 尾部喷射水花粒子系统
    const count = 90;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const alphas = new Float32Array(count);

    this.particles = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100;
      positions[i * 3 + 2] = 0;
      alphas[i] = 0;
      this.particles.push({
        pos: new THREE.Vector3(0, -100, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.6 + Math.random() * 0.4
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.85,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.wakeMesh = new THREE.Points(geometry, material);
    this.scene.add(this.wakeMesh);
  }

  activate(spawnPosition, spawnHeading) {
    this.isActive = true;
    this.position.copy(spawnPosition);
    this.heading = spawnHeading;
    this.speed = 4.0;
    this.group.visible = true;
    this.wakeMesh.visible = true;
  }

  deactivate() {
    this.isActive = false;
    this.group.visible = false;
    this.wakeMesh.visible = false;
    this.speed = 0;
  }

  update(delta, input, time) {
    if (!this.isActive) return;

    const move = input.getMovementVector();

    // 动力学加速与转向计算
    let targetSpeed = 0;
    if (move.forward > 0) {
      targetSpeed = move.sprint ? this.boostSpeed : this.maxSpeed;
    } else if (move.forward < 0) {
      targetSpeed = -8.0; // 倒退
    }

    if (targetSpeed > this.speed) {
      this.speed = Math.min(this.speed + this.acceleration * delta, targetSpeed);
    } else {
      this.speed = Math.max(this.speed - this.deceleration * delta, targetSpeed);
    }

    // 转向与侧倾动态
    if (move.right !== 0) {
      const turnDir = -move.right;
      this.heading += turnDir * this.turnSpeed * delta * (Math.abs(this.speed) > 1 ? 1 : 0.5);
      // 转向时车身侧倾 (Banking)
      this.bankAngle = THREE.MathUtils.lerp(this.bankAngle, -turnDir * 0.42, delta * 8.0);
    } else {
      this.bankAngle = THREE.MathUtils.lerp(this.bankAngle, 0, delta * 6.0);
    }

    // 更新空间水平位移
    this.position.x += Math.sin(this.heading) * this.speed * delta;
    this.position.z += Math.cos(this.heading) * this.speed * delta;

    // 采样波浪高度与法线，计算物理俯仰和横滚
    const waveH = this.ocean.getWaterHeight(this.position.x, this.position.z, time);
    const waveNormal = this.ocean.getWaterNormal(this.position.x, this.position.z, time);

    this.position.y = waveH + 0.12;

    // 俯仰角 (前倾/后仰) 根据波浪法线沿前进方向的投影
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const pitch = -(forwardX * waveNormal.x + forwardZ * waveNormal.z) * 0.65;

    // 组装滑板旋转欧拉角 (Yaw, Pitch, Roll + Bank)
    this.group.position.copy(this.position);
    this.group.rotation.set(pitch, this.heading, this.bankAngle, 'YXZ');

    // 更新尾浪水花粒子
    this._updateWake(delta);
  }

  _updateWake(delta) {
    if (Math.abs(this.speed) < 3.0) return;

    const positions = this.wakeMesh.geometry.attributes.position.array;
    const count = this.particles.length;

    // 每次更新发射 3 个尾浪新粒子
    for (let k = 0; k < 3; k++) {
      const idx = Math.floor(Math.random() * count);
      const p = this.particles[idx];
      const tailOffset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        0,
        -1.3
      ).applyEuler(this.group.rotation);

      p.pos.copy(this.position).add(tailOffset);
      p.vel.set(
        (Math.random() - 0.5) * 3.0,
        1.5 + Math.random() * 2.5,
        (Math.random() - 0.5) * 3.0
      );
      p.life = 0;
    }

    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      p.life += delta;
      if (p.life < p.maxLife) {
        p.pos.addScaledVector(p.vel, delta);
        p.vel.y -= 9.8 * delta; // 重力沉降
        positions[i * 3] = p.pos.x;
        positions[i * 3 + 1] = p.pos.y;
        positions[i * 3 + 2] = p.pos.z;
      } else {
        positions[i * 3 + 1] = -100;
      }
    }

    this.wakeMesh.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.wakeMesh);
  }
}
