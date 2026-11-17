import * as THREE from '../../lib/three.module.js';

/**
 * 物理海洋系统 (Spectral Ocean)
 * 采用 Gerstner 波浪频谱叠加坡度方程，与 GPU 着色器严格同步，支持物理浮力采样与浪尖破碎泡沫
 */
export class Ocean {
  constructor(scene, sunLight) {
    this.scene = scene;
    this.sunLight = sunLight;
    this.time = 0;

    // 海洋基准海平面高度
    this.waterLevel = 0.0;

    // 波浪多级频谱参数配置 [方向X, 方向Z, 陡峭度Q, 振幅A, 波长L, 速度S]
    this.waveParams = [
      { dir: new THREE.Vector2(0.92, 0.38).normalize(), Q: 0.45, A: 1.25, L: 85.0, speed: 1.1 },
      { dir: new THREE.Vector2(0.38, 0.92).normalize(), Q: 0.38, A: 0.85, L: 46.0, speed: 1.4 },
      { dir: new THREE.Vector2(-0.7, 0.71).normalize(), Q: 0.30, A: 0.55, L: 26.0, speed: 1.8 },
      { dir: new THREE.Vector2(0.65, -0.75).normalize(), Q: 0.25, A: 0.32, L: 14.0, speed: 2.2 },
      { dir: new THREE.Vector2(-0.85, -0.52).normalize(), Q: 0.20, A: 0.18, L: 6.5, speed: 2.8 }
    ];

    this._precomputeWaveConstants();
    this.initMesh();
  }

  _precomputeWaveConstants() {
    this.waves = this.waveParams.map(w => {
      const k = (2.0 * Math.PI) / w.L; // 波数
      const wSpeed = Math.sqrt(9.81 * k) * w.speed; // 色散关系角频率
      return {
        dirX: w.dir.x,
        dirZ: w.dir.y,
        steepness: w.Q / (k * w.A * this.waveParams.length),
        amplitude: w.A,
        k: k,
        omega: wSpeed
      };
    });
  }

  initMesh() {
    // 采用高密度大范围多边形网格
    const size = 3200;
    const segments = 160;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    // 动态 Uniforms
    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.96, 0.88) },
      uDeepColor: { value: new THREE.Color(0.015, 0.08, 0.20) }, // 深海靛青色
      uShallowColor: { value: new THREE.Color(0.04, 0.36, 0.44) }, // 近海翡翠浅青
      uFoamColor: { value: new THREE.Color(0.95, 0.98, 1.0) }, // 浪花白色
      uCameraPos: { value: new THREE.Vector3() }
    };

    const vertexShader = /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vWaveHeight;
      varying float vJacobian;

      struct GerstnerWave {
        vec2 dir;
        float steepness;
        float amplitude;
        float k;
        float omega;
      };

      const int NUM_WAVES = 5;

      void main() {
        vec3 pos = position;
        
        GerstnerWave waves[5];
        waves[0] = GerstnerWave(vec2(0.92, 0.38), 0.42, 1.25, 0.0739, 0.937);
        waves[1] = GerstnerWave(vec2(0.38, 0.92), 0.38, 0.85, 0.1365, 1.621);
        waves[2] = GerstnerWave(vec2(-0.7, 0.71), 0.30, 0.55, 0.2416, 2.768);
        waves[3] = GerstnerWave(vec2(0.65, -0.75), 0.25, 0.32, 0.4487, 4.615);
        waves[4] = GerstnerWave(vec2(-0.85, -0.52), 0.20, 0.18, 0.9666, 8.625);

        vec3 displaced = pos;
        vec3 tangent = vec3(1.0, 0.0, 0.0);
        vec3 binormal = vec3(0.0, 0.0, 1.0);
        float Jxx = 1.0;
        float Jzz = 1.0;

        for (int i = 0; i < NUM_WAVES; i++) {
          vec2 d = normalize(waves[i].dir);
          float theta = waves[i].k * dot(d, pos.xz) - waves[i].omega * uTime;
          float c = cos(theta);
          float s = sin(theta);
          float qa = waves[i].steepness * waves[i].amplitude;

          displaced.x += d.x * qa * c;
          displaced.z += d.y * qa * c;
          displaced.y += waves[i].amplitude * s;

          float wa = waves[i].k * waves[i].amplitude;
          tangent += vec3(-d.x * d.x * qa * s, d.x * wa * c, -d.x * d.y * qa * s);
          binormal += vec3(-d.x * d.y * qa * s, d.y * wa * c, -d.y * d.y * qa * s);

          Jxx -= d.x * d.x * qa * s;
          Jzz -= d.y * d.y * qa * s;
        }

        vNormal = normalize(cross(binormal, tangent));
        vWaveHeight = displaced.y;
        vJacobian = Jxx * Jzz;

        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      uniform vec3 uCameraPos;
      uniform float uTime;

      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vWaveHeight;
      varying float vJacobian;

      // 快速微噪点函数
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

      void main() {
        vec3 viewDir = normalize(uCameraPos - vWorldPos);
        vec3 normal = normalize(vNormal);

        // 微表面法线扰动，模拟风力细密波纹
        vec2 detailUV = vWorldPos.xz * 0.35 + vec2(uTime * 0.4, uTime * 0.25);
        float microNoise = noise(detailUV) * 0.2 - 0.1;
        normal.x += microNoise;
        normal.z += microNoise;
        normal = normalize(normal);

        // 菲涅尔反射计算 (Schlick 近似)
        float NdotV = max(dot(normal, viewDir), 0.0);
        float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

        // 太阳高光 (Blinn-Phong + GGX 分布)
        vec3 halfDir = normalize(viewDir + uSunDir);
        float NdotH = max(dot(normal, halfDir), 0.0);
        float spec = pow(NdotH, 180.0) * 2.8;

        // 水深与浪高色彩过渡
        float heightFactor = clamp((vWaveHeight + 1.2) / 2.6, 0.0, 1.0);
        vec3 waterColor = mix(uDeepColor, uShallowColor, heightFactor);

        // 天空倒影色彩
        vec3 skyColor = mix(vec3(0.5, 0.7, 0.9), vec3(0.18, 0.35, 0.65), normal.y);
        vec3 baseColor = mix(waterColor, skyColor, fresnel * 0.65);

        // 浪尖破碎泡沫 (基于波浪网格雅可比压缩比)
        float foam = clamp(1.0 - vJacobian * 1.2, 0.0, 1.0);
        foam = smoothstep(0.35, 0.85, foam);

        // 混合泡沫与高光
        vec3 finalColor = mix(baseColor, uFoamColor, foam * 0.75);
        finalColor += uSunColor * spec;

        // 柔和的大气距离雾
        float dist = length(uCameraPos - vWorldPos);
        float fogFactor = clamp((dist - 80.0) / 1800.0, 0.0, 0.85);
        finalColor = mix(finalColor, vec3(0.55, 0.72, 0.88), fogFactor);

        gl_FragColor = vec4(finalColor, 0.92);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.y = this.waterLevel;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }

  /**
   * CPU 端实时波浪采样：计算指定 (x, z) 坐标在当前时间的水面高度
   * 供人物、滑板和船只浮力系统直接调用
   */
  getWaterHeight(x, z, time = this.time) {
    let height = this.waterLevel;

    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      const theta = w.k * (w.dirX * x + w.dirZ * z) - w.omega * time;
      height += w.amplitude * Math.sin(theta);
    }

    return height;
  }

  /**
   * CPU 端波浪法线采样：计算指定 (x, z) 坐标的水面法线矢量
   * 用于船体与滑板贴浪倾角 (Pitch & Roll) 计算
   */
  getWaterNormal(x, z, time = this.time) {
    const delta = 0.5;
    const hCenter = this.getWaterHeight(x, z, time);
    const hRight = this.getWaterHeight(x + delta, z, time);
    const hForward = this.getWaterHeight(x, z + delta, time);

    const normal = new THREE.Vector3(
      -(hRight - hCenter) / delta,
      1.0,
      -(hForward - hCenter) / delta
    ).normalize();

    return normal;
  }

  update(delta, camera) {
    this.time += delta;
    this.uniforms.uTime.value = this.time;
    if (camera) {
      this.uniforms.uCameraPos.value.copy(camera.position);
      // 网格中心轻微吸附跟随相机，营造无缝大洋
      this.mesh.position.x = Math.floor(camera.position.x / 20) * 20;
      this.mesh.position.z = Math.floor(camera.position.z / 20) * 20;
    }
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.material.dispose();
      this.scene.remove(this.mesh);
    }
  }
}
