import * as THREE from '../../lib/three.module.js';

/**
 * 码头与港口设施系统 (Harbor & Dock)
 * 纯程序化构建明代水师官澳码头：主栈桥、泊位木桩、起重吊架、灯塔与大明龙旗
 */
export class Dock {
  constructor(scene) {
    this.scene = scene;
    this.dockGroup = new THREE.Group();

    // 码头空间基准位置（位于主岛东侧入海口）
    this.origin = new THREE.Vector3(90, 3.2, 0);

    // 栈桥通行碰撞范围
    this.bounds = [
      // 主干道 (从陆地延伸至海中)
      { minX: 50, maxX: 140, minZ: -5.0, maxZ: 5.0, height: 3.2 },
      // T型深水泊位平台
      { minX: 135, maxX: 165, minZ: -32.0, maxZ: 32.0, height: 3.2 }
    ];

    this.initPiers();
    this.initLighthouse();
    this.initPropsAndDecorations();
    this.scene.add(this.dockGroup);
  }

  /**
   * 检查指定 (x, z) 是否在码头栈桥上方
   * @returns {number|null} 若在栈桥上返回桥面高度，否则返回 null
   */
  getDockHeight(x, z) {
    for (let i = 0; i < this.bounds.length; i++) {
      const b = this.bounds[i];
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        return b.height;
      }
    }
    return null;
  }

  initPiers() {
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x6e4a2c,
      roughness: 0.85,
      metalness: 0.05
    });

    const plankMat = new THREE.MeshStandardMaterial({
      color: 0x8b6540,
      roughness: 0.75,
      metalness: 0.05
    });

    // 1. 主干栈桥桥面 (长 90m, 宽 10m, 厚 0.8m)
    const mainDeckGeo = new THREE.BoxGeometry(90, 0.8, 10);
    const mainDeck = new THREE.Mesh(mainDeckGeo, plankMat);
    mainDeck.position.set(95, 2.8, 0);
    mainDeck.receiveShadow = true;
    mainDeck.castShadow = true;
    this.dockGroup.add(mainDeck);

    // 2. 深水泊位横向大平台 (长 30m, 宽 64m)
    const berthDeckGeo = new THREE.BoxGeometry(30, 0.8, 64);
    const berthDeck = new THREE.Mesh(berthDeckGeo, plankMat);
    berthDeck.position.set(150, 2.8, 0);
    berthDeck.receiveShadow = true;
    berthDeck.castShadow = true;
    this.dockGroup.add(berthDeck);

    // 3. 支撑木桩群 (深插至海底)
    const pileGeo = new THREE.CylinderGeometry(0.5, 0.55, 14, 8);
    for (let x = 60; x <= 160; x += 12) {
      for (let z of [-4.5, 4.5, -28, 28, 0]) {
        if (x < 135 && Math.abs(z) > 5) continue;
        const pile = new THREE.Mesh(pileGeo, woodMat);
        pile.position.set(x, -3.0, z);
        pile.castShadow = true;
        this.dockGroup.add(pile);
      }
    }

    // 4. 码头边缘系缆木桩 (Bollards)
    const bollardGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.2, 8);
    for (let z = -28; z <= 28; z += 8) {
      const b = new THREE.Mesh(bollardGeo, woodMat);
      b.position.set(164.5, 3.8, z);
      b.castShadow = true;
      this.dockGroup.add(b);
    }
  }

  initLighthouse() {
    // 码头尽头航标灯塔 (八角形防风灯塔)
    const baseGeo = new THREE.CylinderGeometry(4.2, 5.5, 6, 8);
    const towerGeo = new THREE.CylinderGeometry(2.6, 4.0, 18, 8);
    const lanternRoomGeo = new THREE.CylinderGeometry(2.2, 2.2, 4, 8);
    const roofGeo = new THREE.ConeGeometry(3.0, 3.5, 8);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xdfdcd0, roughness: 0.9 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0x9e2a2b, roughness: 0.8 });
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffe680 });

    const lighthouse = new THREE.Group();
    lighthouse.position.set(150, 3.2, -26);

    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.y = 3;
    base.castShadow = true;
    lighthouse.add(base);

    const tower = new THREE.Mesh(towerGeo, redMat);
    tower.position.y = 15;
    tower.castShadow = true;
    lighthouse.add(tower);

    const lantern = new THREE.Mesh(lanternRoomGeo, stoneMat);
    lantern.position.y = 26;
    lighthouse.add(lantern);

    // 发光核心
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), beaconMat);
    beacon.position.y = 26;
    lighthouse.add(beacon);

    // 旋转航标探照聚光灯
    this.lighthouseLight = new THREE.SpotLight(0xfffae0, 8.0, 350, Math.PI / 6, 0.4);
    this.lighthouseLight.position.set(0, 26, 0);
    this.lighthouseTarget = new THREE.Object3D();
    this.lighthouseTarget.position.set(100, 5, 0);
    lighthouse.add(this.lighthouseLight);
    lighthouse.add(this.lighthouseTarget);
    this.lighthouseLight.target = this.lighthouseTarget;

    const roof = new THREE.Mesh(roofGeo, redMat);
    roof.position.y = 29.5;
    lighthouse.add(roof);

    this.dockGroup.add(lighthouse);
  }

  initPropsAndDecorations() {
    // 货物箱、木桶与起重吊杆
    const crateGeo = new THREE.BoxGeometry(1.8, 1.8, 1.8);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xa67c52, roughness: 0.8 });
    const barrelGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.6, 8);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x543d2b, roughness: 0.8 });

    for (let i = 0; i < 12; i++) {
      const crate = new THREE.Mesh(crateGeo, crateMat);
      crate.position.set(138 + (i % 4) * 2.2, 4.1, -12 + Math.floor(i / 4) * 2.2);
      crate.castShadow = true;
      this.dockGroup.add(crate);
    }

    for (let i = 0; i < 8; i++) {
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(140 + (i % 3) * 1.8, 4.0, 15 + Math.floor(i / 3) * 2.0);
      barrel.castShadow = true;
      this.dockGroup.add(barrel);
    }

    // 大明龙纹官旗 (红金战旗)
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 12, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
    const flagGeo = new THREE.PlaneGeometry(4.0, 2.4);
    const flagMat = new THREE.MeshStandardMaterial({
      color: 0xc92a2a,
      roughness: 0.6,
      side: THREE.DoubleSide
    });

    const flagpole = new THREE.Mesh(poleGeo, poleMat);
    flagpole.position.set(148, 8.8, 26);
    flagpole.castShadow = true;
    this.dockGroup.add(flagpole);

    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(150, 13.5, 26);
    flag.rotation.y = Math.PI / 2;
    this.dockGroup.add(flag);
    this.flag = flag;
  }

  update(delta) {
    // 旋转灯塔探照光
    if (this.lighthouseTarget) {
      const angle = Date.now() * 0.0012;
      this.lighthouseTarget.position.x = 100 * Math.cos(angle);
      this.lighthouseTarget.position.z = 100 * Math.sin(angle);
    }

    // 旗帜微风轻拂波动
    if (this.flag) {
      this.flag.rotation.y = Math.PI / 2 + Math.sin(Date.now() * 0.003) * 0.15;
    }
  }

  dispose() {
    this.scene.remove(this.dockGroup);
  }
}
