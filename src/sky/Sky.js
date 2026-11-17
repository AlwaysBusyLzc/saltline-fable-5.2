import * as THREE from '../../lib/three.module.js';

/**
 * 体积云与大气散射天空系统 (Volumetric Sky)
 * 基于 Rayleigh/Mie 大气物理散射与 FBM 噪声光线步进体积云算法
 */
export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    // 太阳方向与光照配置
    this.sunDir = new THREE.Vector3(0.65, 0.55, 0.45).normalize();
    this.initLights();
    this.initSkyDome();
  }

  initLights() {
    // 太阳直射平行光
    this.sunLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(800);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 1600;
    const d = 300;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // 半球环境光 (天空蓝与海面青)
    this.ambientLight = new THREE.HemisphereLight(0xbbe0ff, 0x224455, 1.2);
    this.scene.add(this.ambientLight);
  }

  initSkyDome() {
    // 巨大天空穹顶球体
    const geometry = new THREE.SphereGeometry(2200, 32, 24);
    geometry.scale(-1, 1, 1); // 法线朝内

    this.uniforms = {
      uSunDir: { value: this.sunDir },
      uTime: { value: 0 },
      uZenithColor: { value: new THREE.Color(0.12, 0.35, 0.75) }, // 天顶深蓝
      uHorizonColor: { value: new THREE.Color(0.68, 0.82, 0.95) }, // 地平线苍白微蓝
      uSunColor: { value: new THREE.Color(1.0, 0.94, 0.82) }
    };

    const vertexShader = /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunColor;

      varying vec3 vWorldPosition;

      // 快速伪随机与分形噪声 (FBM)
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = rot * p + 1.2;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = max(dir.y, 0.0);

        // 大气散射渐变：从地平线过渡到天顶
        vec3 skyColor = mix(uHorizonColor, uZenithColor, pow(h, 0.55));

        // 太阳光晕 (Mie 散射)
        float cosTheta = dot(dir, normalize(uSunDir));
        float sunGlow = pow(max(cosTheta, 0.0), 32.0) * 0.8 + pow(max(cosTheta, 0.0), 256.0) * 3.5;
        skyColor += uSunColor * sunGlow;

        // 体积云层平面投影 (云底高度设在 h > 0.05 区域)
        if (dir.y > 0.02) {
          vec2 cloudUV = dir.xz / (dir.y + 0.12) * 0.35 + vec2(uTime * 0.008, uTime * 0.004);
          
          // 双层分形噪声步进计算云密度
          float c1 = fbm(cloudUV * 2.5);
          float c2 = fbm(cloudUV * 6.0 + 3.5);
          float cloudDensity = smoothstep(0.42, 0.78, c1 * 0.7 + c2 * 0.3);

          // 云层向阳面散射与背阳面漫射
          float sunDotCloud = max(dot(dir, uSunDir), 0.0);
          vec3 cloudBright = mix(vec3(0.92, 0.94, 0.98), uSunColor * 1.3, pow(sunDotCloud, 4.0));
          vec3 cloudDark = mix(vec3(0.55, 0.62, 0.72), uHorizonColor, 0.5);
          vec3 cloudColor = mix(cloudDark, cloudBright, c1);

          // 边缘半透明融合
          skyColor = mix(skyColor, cloudColor, cloudDensity * smoothstep(0.02, 0.15, dir.y));
        }

        gl_FragColor = vec4(skyColor, 1.0);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);
  }

  update(delta, camera) {
    this.time += delta;
    this.uniforms.uTime.value = this.time;
    if (camera) {
      // 天空球始终包裹摄像机
      this.mesh.position.copy(camera.position);
      // 太阳光跟随摄像机移动其投影截头体中心
      this.sunLight.position.copy(camera.position).add(this.sunDir.clone().multiplyScalar(500));
      this.sunLight.target.position.copy(camera.position);
      this.sunLight.target.updateMatrixWorld();
    }
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.material.dispose();
      this.scene.remove(this.mesh);
    }
    if (this.sunLight) this.scene.remove(this.sunLight);
    if (this.ambientLight) this.scene.remove(this.ambientLight);
  }
}
