import * as THREE from '../../lib/three.module.js';

/**
 * 大地图地形系统 (World Terrain)
 * 包含龙牙主岛、满剌加岛、求罗群礁等海陆生态群，支持精确高度场采样与顶点色自然过渡
 */
export class Terrain {
  constructor(scene) {
    this.scene = scene;

    // 核心群岛坐标与规模定义
    this.islands = [
      { name: '龙牙主岛', x: 0, z: 0, radius: 240, height: 32 },
      { name: '满剌加岛', x: 480, z: -400, radius: 150, height: 45 },
      { name: '求罗群礁', x: -440, z: 360, radius: 170, height: 14 },
      { name: '风暴要塞角', x: -500, z: -450, radius: 140, height: 38 }
    ];

    this.initTerrainMesh();
    this.initDecorations();
  }

  /**
   * 平滑径向岛屿衰减函数
   */
  _smoothStep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /**
   * 快速 2D 梯度分形噪声 (CPU 快速计算地形高度)
   */
  _noise2D(x, z) {
    const s = Math.sin(x * 0.015) * Math.cos(z * 0.015);
    const m = Math.sin(x * 0.045 + 1.2) * Math.cos(z * 0.045 + 2.1) * 0.45;
    const d = Math.sin(x * 0.12 - 0.7) * Math.cos(z * 0.12 + 1.5) * 0.18;
    return s + m + d;
  }

  /**
   * 获取任意 (x, z) 坐标处的地形高度
   * @returns {number} 地表海拔高度（小于 0 表示水下海床）
   */
  getTerrainHeight(x, z) {
    let maxHeight = -25.0; // 默认深海海床高度

    for (let i = 0; i < this.islands.length; i++) {
      const isl = this.islands[i];
      const dist = Math.hypot(x - isl.x, z - isl.z);

      if (dist < isl.radius * 1.5) {
        // 岛屿边缘向水面平缓过渡
        const factor = 1.0 - this._smoothStep(isl.radius * 0.25, isl.radius, dist);
        const noise = this._noise2D(x + isl.x * 0.1, z + isl.z * 0.1);

        // 主岛东侧特意规划平缓的码头内湾
        let harborFlat = 0;
        if (isl.name === '龙牙主岛' && x > 40 && x < 150 && Math.abs(z) < 60) {
          harborFlat = 2.5; // 码头连接处平整开阔
        }

        const islandHeight = factor * (isl.height + noise * 10.0) - (1.0 - factor) * 15.0 + harborFlat;
        if (islandHeight > maxHeight) {
          maxHeight = islandHeight;
        }
      }
    }

    return maxHeight;
  }

  initTerrainMesh() {
    const size = 2400;
    const segments = 220;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position.array;
    const colors = new Float32Array(positions.length);

    // 经典地貌色板
    const colorDeepSea = new THREE.Color(0x0e243a);  // 水底深处
    const colorSand = new THREE.Color(0xd6be88);     // 沙滩金黄
    const colorPlains = new THREE.Color(0x4a7c38);   // 茵茵草地
    const colorForest = new THREE.Color(0x285222);   // 翠密林木
    const colorRock = new THREE.Color(0x615b53);     // 峭壁岩石

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      const y = this.getTerrainHeight(x, z);
      positions[i + 1] = y;

      // 根据海拔高度与起伏插值顶点色彩
      let col = new THREE.Color();
      if (y < -0.5) {
        col.lerpColors(colorDeepSea, colorSand, Math.min(1, (y + 15) / 14.5));
      } else if (y < 2.8) {
        col.lerpColors(colorSand, colorPlains, (y + 0.5) / 3.3);
      } else if (y < 16.0) {
        col.lerpColors(colorPlains, colorForest, (y - 2.8) / 13.2);
      } else {
        col.lerpColors(colorForest, colorRock, Math.min(1, (y - 16.0) / 12.0));
      }

      colors[i] = col.r;
      colors[i + 1] = col.g;
      colors[i + 2] = col.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.scene.add(this.mesh);
  }

  /**
   * 程序化生成岛屿植被、棕榈树与海崖礁石
   */
  initDecorations() {
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.65, 8.0, 6);
    const leavesGeo = new THREE.ConeGeometry(3.6, 6.0, 6);
    const rockGeo = new THREE.DodecahedronGeometry(2.5, 1);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.9 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2e6b2c, roughness: 0.7 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x524e49, roughness: 0.9 });

    this.decorationGroup = new THREE.Group();

    // 在各岛屿陆地（海拔 > 2.0 且 < 24.0）散布植被
    const random = (seed) => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    let seed = 42;
    for (let i = 0; i < 280; i++) {
      const angle = random(seed++) * Math.PI * 2;
      const dist = 30 + random(seed++) * 180;
      const islandIdx = Math.floor(random(seed++) * this.islands.length);
      const isl = this.islands[islandIdx];

      const x = isl.x + Math.cos(angle) * dist;
      const z = isl.z + Math.sin(angle) * dist;
      const y = this.getTerrainHeight(x, z);

      // 避开码头主干道
      if (Math.hypot(x - 90, z) < 40) continue;

      if (y > 2.2 && y < 22.0) {
        // 生成棕榈树
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, y + 4.0, z);
        trunk.rotation.x = (random(seed++) - 0.5) * 0.2;
        trunk.rotation.z = (random(seed++) - 0.5) * 0.2;
        trunk.scale.setScalar(0.7 + random(seed++) * 0.6);
        trunk.castShadow = true;

        const leaves = new THREE.Mesh(leavesGeo, leavesMat);
        leaves.position.set(0, 4.0, 0);
        leaves.castShadow = true;
        trunk.add(leaves);

        this.decorationGroup.add(trunk);
      } else if (y > 0.0 && y <= 2.2 && random(seed++) > 0.6) {
        // 沙滩海礁石
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set(x, y + 0.8, z);
        rock.rotation.set(random(seed++) * 3, random(seed++) * 3, random(seed++) * 3);
        rock.scale.set(1.5 + random(seed++), 1.0 + random(seed++), 1.5 + random(seed++));
        rock.castShadow = true;
        this.decorationGroup.add(rock);
      }
    }

    this.scene.add(this.decorationGroup);
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.scene.remove(this.mesh);
    }
    if (this.decorationGroup) {
      this.scene.remove(this.decorationGroup);
    }
  }
}
