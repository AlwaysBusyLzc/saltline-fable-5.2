import * as THREE from '../../lib/three.module.js';

/**
 * 玩家主角角色 (Player)
 * 采用程序化水手角色模型、骨骼动画与海陆坡度行走贴地力学
 */
export class Player {
  constructor(scene, terrain, dock) {
    this.scene = scene;
    this.terrain = terrain;
    this.dock = dock;

    // 初始位置：位于码头主栈桥陆地起点附近
    this.position = new THREE.Vector3(75, 3.2, 0);
    this.rotationY = -Math.PI / 2; // 面向大海东方

    this.velocity = new THREE.Vector3();
    this.walkSpeed = 9.0;
    this.sprintSpeed = 16.0;
    this.swimSpeed = 4.5;
    this.speed = 0;

    // 动画状态
    this.animTime = 0;
    this.isMoving = false;
    this.isInWater = false;
    this.isOnDock = true;

    this.initModel();
  }

  initModel() {
    this.group = new THREE.Group();

    // 材质定义
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.7 });
    const tunicMat = new THREE.MeshStandardMaterial({ color: 0x1d4e89, roughness: 0.6 }); // 大明水师靛青棉甲
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.8 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9 });
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xb53229, roughness: 0.5 }); // 红笠水师帽

    // 1. 身体躯干
    const torsoGeo = new THREE.BoxGeometry(0.8, 1.1, 0.45);
    this.torso = new THREE.Mesh(torsoGeo, tunicMat);
    this.torso.position.y = 1.35;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    // 腰带
    const beltGeo = new THREE.BoxGeometry(0.84, 0.16, 0.48);
    const beltMat = new THREE.MeshStandardMaterial({ color: 0xc49a45 });
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = -0.35;
    this.torso.add(belt);

    // 2. 头部
    const headGeo = new THREE.BoxGeometry(0.45, 0.48, 0.45);
    this.head = new THREE.Mesh(headGeo, skinMat);
    this.head.position.y = 0.85;
    this.head.castShadow = true;
    this.torso.add(this.head);

    // 斗笠/红盔
    const hatGeo = new THREE.ConeGeometry(0.65, 0.35, 12);
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 0.35;
    hat.castShadow = true;
    this.head.add(hat);

    // 3. 手臂 (左右各一)
    const armGeo = new THREE.BoxGeometry(0.24, 0.85, 0.24);
    armGeo.translate(0, -0.35, 0);

    this.leftArm = new THREE.Mesh(armGeo, tunicMat);
    this.leftArm.position.set(-0.52, 0.42, 0);
    this.leftArm.castShadow = true;
    this.torso.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, tunicMat);
    this.rightArm.position.set(0.52, 0.42, 0);
    this.rightArm.castShadow = true;
    this.torso.add(this.rightArm);

    // 4. 双腿与战靴
    const legGeo = new THREE.BoxGeometry(0.3, 0.95, 0.3);
    legGeo.translate(0, -0.45, 0);

    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.24, 0.88, 0);
    this.leftLeg.castShadow = true;
    this.group.add(this.leftLeg);

    const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.35, 0.42), bootMat);
    leftBoot.position.set(0, -0.85, 0.05);
    this.leftLeg.add(leftBoot);

    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.24, 0.88, 0);
    this.rightLeg.castShadow = true;
    this.group.add(this.rightLeg);

    const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.35, 0.42), bootMat);
    rightBoot.position.set(0, -0.85, 0.05);
    this.rightLeg.add(rightBoot);

    this.group.position.copy(this.position);
    this.scene.add(this.group);
  }

  /**
   * 角色位移与物理贴地检测
   */
  update(delta, input, cameraFacingYaw) {
    const move = input.getMovementVector();
    this.isMoving = move.forward !== 0 || move.right !== 0;

    let targetSpeed = 0;
    if (this.isMoving) {
      targetSpeed = move.sprint ? this.sprintSpeed : this.walkSpeed;
      if (this.isInWater) targetSpeed = this.swimSpeed;

      // 依据相机方位角计算世界移动方向
      const inputAngle = Math.atan2(move.right, move.forward);
      const moveAngle = cameraFacingYaw + inputAngle;

      this.velocity.x = Math.sin(moveAngle) * targetSpeed;
      this.velocity.z = Math.cos(moveAngle) * targetSpeed;

      // 平滑转向移动方向
      this.rotationY = THREE.MathUtils.lerp(this.rotationY, moveAngle, delta * 12.0);
    } else {
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, 0, delta * 10.0);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, 0, delta * 10.0);
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    // 位移推进
    this.position.x += this.velocity.x * delta;
    this.position.z += this.velocity.z * delta;

    // 高度与碰撞判定：先测码头，再测地形
    const dockH = this.dock.getDockHeight(this.position.x, this.position.z);
    const terrainH = this.terrain.getTerrainHeight(this.position.x, this.position.z);

    if (dockH !== null) {
      this.isOnDock = true;
      this.isInWater = false;
      this.position.y = dockH;
    } else {
      this.isOnDock = false;
      if (terrainH >= 0.0) {
        this.isInWater = false;
        this.position.y = terrainH;
      } else {
        // 进入水中 (游泳/踏水形态)
        this.isInWater = true;
        this.position.y = -0.5 + Math.sin(this.animTime * 4.0) * 0.15;
      }
    }

    // 更新角色网格世界矩阵与姿态
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;

    // 奔跑摆臂摆腿程序化骨骼摇摆
    if (this.isMoving) {
      this.animTime += delta * (this.speed * 0.85);
      const swing = Math.sin(this.animTime * 6.0) * 0.65;
      this.leftArm.rotation.x = swing;
      this.rightArm.rotation.x = -swing;
      this.leftLeg.rotation.x = -swing;
      this.rightLeg.rotation.x = swing;
      this.torso.position.y = 1.35 + Math.abs(Math.sin(this.animTime * 12.0)) * 0.08;
    } else {
      // 待机呼吸微动
      this.animTime += delta;
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, delta * 8.0);
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, delta * 8.0);
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, delta * 8.0);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, delta * 8.0);
      this.torso.position.y = 1.35 + Math.sin(this.animTime * 2.0) * 0.02;
    }
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
