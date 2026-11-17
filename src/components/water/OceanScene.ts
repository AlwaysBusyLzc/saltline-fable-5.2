import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { oceanVertex, oceanFragment } from './shaders'
import { SpectralOcean } from './SpectralOcean'
import { ShoreFoam } from './ShoreFoam'
import { VolumetricSky } from './VolumetricSky'
import { UnderwaterLighting } from './UnderwaterLighting'
import { WeatherSystem, type WeatherSnapshot } from './weather'
import { presets, qualityOptions, type CameraMode, type WaterSettings } from './settings'

interface SceneCallbacks {
  weather?: (snapshot: WeatherSnapshot) => void
  progress: (percent: number, label: string) => void
  ready: () => void
  error: (message: string) => void
  stats: (fps: number, underwater: boolean, speed: number, mode?: CameraMode, pos?: { x: number; z: number }, heading?: number) => void
  notify?: (message: string) => void
}

function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse(object => {
    const mesh = object as THREE.Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    if (mesh.material) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material)
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value)
        }
      }
    }
  })
  textures.forEach(texture => texture.dispose())
  materials.forEach(material => material.dispose())
  geometries.forEach(geometry => geometry.dispose())
}

export class OceanScene {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.15, 16000)
  private readonly renderer: THREE.WebGLRenderer
  private readonly controls: OrbitControls
  private readonly observer: ResizeObserver
  private readonly events = new AbortController()
  private readonly textures: THREE.Texture[] = []
  private readonly draco = new DRACOLoader()
  private readonly refraction = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  private readonly sun = new THREE.DirectionalLight(0xfff5df, 2.8)
  private readonly ambient = new THREE.HemisphereLight(0xb4dafa, 0x497477, 1.6)
  private readonly fill = new THREE.DirectionalLight(0xc7dcea, 1.1)
  private readonly ship = new THREE.Group()
  private readonly hull = new THREE.Group()
  private readonly probes = new THREE.Group()
  private readonly wakeProbes = new THREE.Group()
  private readonly buoys: THREE.Group[] = []
  private readonly fish: THREE.Object3D[] = []
  private readonly mixers: THREE.AnimationMixer[] = []
  private readonly keys = new Set<string>()
  private readonly sky: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private readonly atmosphere: VolumetricSky
  private readonly spectrum: SpectralOcean
  private readonly ocean: Reflector
  private readonly material: THREE.ShaderMaterial
  private readonly weather: WeatherSystem
  private environment: THREE.WebGLRenderTarget | null = null
  private environmentGenerator: THREE.PMREMGenerator | undefined
  private lastEnvironmentUpdate = 0
  private lastWeatherStats = 0
  private environmentTimer: ReturnType<typeof setTimeout> | undefined
  private animation = 0
  private disposed = false
  private time = 0
  private lastFrame = 0
  private lastStats = 0
  private frameCount = 0
  private mode: CameraMode = 'player'
  private speed = 0
  private heading = -0.12
  private settings: WaterSettings
  private width = 1
  private height = 1
  private readonly shoreFoam = new ShoreFoam()
  private readonly underwaterLight = new UnderwaterLighting()
  private underwater = false
  private waterLevel = 0

  // RPG 系统扩展元素：码头、角色、水上滑板
  private readonly dock = new THREE.Group()
  private readonly playerGroup = new THREE.Group()
  private readonly playerMesh = new THREE.Group()
  private readonly skateboard = new THREE.Group()
  private wakeSprayMesh!: THREE.Points
  private readonly wakeParticles: { pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number }[] = []
  
  // 角色动力学状态
  private playerPos = new THREE.Vector3(-7.5, 3.1, -16)
  private playerHeading = 2.35
  private playerSpeed = 0
  private playerAnim = 0
  private playerLimbs: { leftArm: THREE.Mesh; rightArm: THREE.Mesh; leftLeg: THREE.Mesh; rightLeg: THREE.Mesh; torso: THREE.Mesh } | null = null

  // 滑板动力学状态
  private skateboardPos = new THREE.Vector3(-6, 0, -15)
  private skateboardHeading = 0
  private skateboardSpeed = 0
  private skateboardBank = 0

  constructor(private readonly host: HTMLElement, settings: WaterSettings, private readonly callbacks: SceneCallbacks) {
    this.settings = { ...settings }
    this.weather = new WeatherSystem(settings)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.95
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.setAttribute('aria-label', '可交互的海洋三维场景')
    this.renderer.domElement.tabIndex = 0
    host.appendChild(this.renderer.domElement)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.065
    this.controls.minDistance = 3
    this.controls.maxDistance = 650
    this.controls.maxPolarAngle = Math.PI * 0.78
    this.controls.target.set(-18, 3, -30)
    this.camera.position.set(-18, 5.5, -22)
    this.controls.update()

    this.refraction.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType)
    this.sun.position.set(-70, 110, -110)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    Object.assign(this.sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 400 })
    this.sun.shadow.bias = -0.00025
    this.sun.shadow.normalBias = 0.035
    this.fill.position.set(28, 42, 65)
    this.fill.color.set('#fff0d7')
    this.scene.add(this.sun, this.ambient, this.fill)

    this.atmosphere = new VolumetricSky(this.renderer, this.camera)
    this.sky = this.atmosphere.mesh
    this.scene.add(this.sky)
    this.spectrum = new SpectralOcean(this.renderer)

    const foam = this.loadTexture('/water/textures/foam-filaments.png')
    this.ocean = new Reflector(this.waterGeometry(settings.quality), {
      textureWidth: qualityOptions[settings.quality].reflection,
      textureHeight: qualityOptions[settings.quality].reflection,
      multisample: 0, clipBias: 0.002,
      shader: {
        name: 'OceanSurface', vertexShader: oceanVertex, fragmentShader: oceanFragment,
        uniforms: {
          color: { value: new THREE.Color() }, textureMatrix: { value: new THREE.Matrix4() }, tDiffuse: { value: null },
          uTime: { value: 0 }, uWind: { value: settings.wind },
          uTexelOffset: { value: 0.5 / 128 },
          uRefraction: { value: null }, uDepth: { value: null }, uFoam: { value: null },
          uShoreField: { value: null }, uShoreBounds: { value: null },
          uDisplacement0: { value: null }, uDisplacement1: { value: null }, uDisplacement2: { value: null },
          uNormal0: { value: null }, uNormal1: { value: null }, uNormal2: { value: null },
          uSkyEnvironment: { value: null }, uReflectionDepth: { value: null },
          uResolution: { value: new THREE.Vector2() }, uEye: { value: new THREE.Vector3() },
          uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
          uWaterColor: { value: new THREE.Color() }, uFogColor: { value: new THREE.Color() },
          uFog: { value: 0.001 }, uDaylight: { value: 1 }, uNear: { value: this.camera.near }, uFar: { value: this.camera.far },
          uBoat: { value: new THREE.Vector3() }, uBoatSpeed: { value: 0 },
        },
      },
    })
    this.material = this.ocean.material as THREE.ShaderMaterial
    this.ocean.getRenderTarget().depthTexture = new THREE.DepthTexture(qualityOptions[settings.quality].reflection, qualityOptions[settings.quality].reflection, THREE.UnsignedIntType)
    this.material.uniforms.uReflectionDepth.value = this.ocean.getRenderTarget().depthTexture
    this.material.uniforms.uSkyEnvironment.value = this.atmosphere.texture
    this.material.side = THREE.DoubleSide
    this.material.uniforms.uRefraction.value = this.refraction.texture
    this.material.uniforms.uDepth.value = this.refraction.depthTexture
    this.material.uniforms.uFoam.value = foam
    this.material.uniforms.uShoreField.value = this.shoreFoam.texture
    this.material.uniforms.uShoreBounds.value = this.shoreFoam.bounds
    this.ocean.rotation.x = -Math.PI / 2
    this.ocean.frustumCulled = false
    this.scene.add(this.ocean)
    this.ship.add(this.hull)
    this.ship.position.set(0, 0, 4)
    this.scene.add(this.ship, this.probes, this.wakeProbes)
    
    // 初始化环境与 RPG 实物
    this.createSeabed()
    this.createProbes()
    this.createDock()
    this.createPlayer()
    this.createSkateboard()
    this.createWakeSpray()

    this.applySettings(settings)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(host)
    this.resize()

    const signal = this.events.signal
    window.addEventListener('keydown', event => {
      if (event.target instanceof HTMLElement && (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable)) return
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyX', 'KeyM', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        if (event.code === 'KeyX') {
          event.preventDefault()
          this.toggleSkateboard()
          return
        }
        if (event.code === 'KeyS' && (this.mode === 'player' || this.mode === 'skateboard')) {
          // 在角色或滑板形态下靠近水面，按 S 召唤战船
          if (this.mode === 'skateboard' || this.playerPos.y <= 1.0 || this.dockHeight(this.playerPos.x, this.playerPos.z) !== null) {
            event.preventDefault()
            this.toggleShip()
            return
          }
        }
        if (event.code !== 'KeyM') {
          event.preventDefault()
        }
        this.keys.add(event.code)
      }
    }, { signal })
    window.addEventListener('keyup', event => this.keys.delete(event.code), { signal })
    window.addEventListener('blur', () => this.keys.clear(), { signal })
    document.addEventListener('visibilitychange', () => { this.lastFrame = 0; this.keys.clear() }, { signal })
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault()
      cancelAnimationFrame(this.animation)
      callbacks.error('图形上下文已中断，请重新加载场景。')
    }, { signal })

    // 默认进入角色徒步视角
    this.setMode('player')

    this.animation = requestAnimationFrame(this.frame)
    void this.loadModels()
  }

  private loadTexture(path: string, srgb = false) {
    const texture = new THREE.TextureLoader().load(path, loaded => {
      if (this.disposed) loaded.dispose()
    }, undefined, () => {
      if (!this.disposed) this.callbacks.error(`纹理加载失败：${path}`)
    })
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace
    this.textures.push(texture)
    return texture
  }

  private waterGeometry(quality: WaterSettings['quality']) {
    const geometry = new THREE.PlaneGeometry(2, 2, qualityOptions[quality].segments, qualityOptions[quality].segments)
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i)
      positions.setXY(i, x * (90 + Math.pow(Math.abs(x), 4) * 6000), y * (90 + Math.pow(Math.abs(y), 4) * 6000))
    }
    geometry.computeBoundingSphere()
    return geometry
  }

  private seabedHeight(x: number, z: number) {
    return -5.4 - Math.min(Math.hypot(x, z + 20) * 0.037, 28) + Math.sin(x * 0.085) * Math.cos(z * 0.07) * 0.85
  }

  private createSeabed() {
    const geometry = new THREE.PlaneGeometry(1400, 1400, 180, 180)
    geometry.rotateX(-Math.PI / 2)
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) positions.setY(i, this.seabedHeight(positions.getX(i), positions.getZ(i)))
    geometry.computeVertexNormals()
    const sand = this.loadTexture('/water/textures/sand.jpg', true)
    const normal = this.loadTexture('/water/textures/sand-normal.jpg')
    sand.repeat.set(160, 160); normal.repeat.set(160, 160)
    const material = new THREE.MeshStandardMaterial({ map: sand, normalMap: normal, color: '#bac8ad', roughness: 0.95, normalScale: new THREE.Vector2(0.45, 0.45) })
    this.underwaterLight.applyTo(material)
    const seabed = new THREE.Mesh(geometry, material)
    seabed.receiveShadow = true
    this.scene.add(seabed)
  }

  private createFaceCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#f2caa0'
    ctx.fillRect(0, 0, 256, 256)

    // 额前红绸抹额
    ctx.fillStyle = '#991b1b'
    ctx.fillRect(0, 0, 256, 52)
    ctx.fillStyle = '#d4af37'
    ctx.fillRect(0, 48, 256, 4)

    // 侧鬓发
    ctx.fillStyle = '#1c1917'
    ctx.fillRect(0, 52, 40, 120)
    ctx.fillRect(216, 52, 40, 120)

    // 剑眉
    ctx.strokeStyle = '#18181b'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(60, 102); ctx.lineTo(108, 96)
    ctx.moveTo(148, 96); ctx.lineTo(196, 102)
    ctx.stroke()

    // 眼睛
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(84, 120, 20, 11, 0, 0, Math.PI * 2)
    ctx.ellipse(172, 120, 20, 11, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#18181b'
    ctx.beginPath()
    ctx.arc(84, 120, 8, 0, Math.PI * 2)
    ctx.arc(172, 120, 8, 0, Math.PI * 2)
    ctx.fill()

    // 瞳孔高光
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(87, 117, 3, 0, Math.PI * 2)
    ctx.arc(175, 117, 3, 0, Math.PI * 2)
    ctx.fill()

    // 鼻影
    ctx.fillStyle = '#dca474'
    ctx.beginPath()
    ctx.moveTo(128, 126); ctx.lineTo(122, 160); ctx.lineTo(134, 160); ctx.closePath()
    ctx.fill()

    // 唇部
    ctx.strokeStyle = '#b95345'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(112, 192); ctx.lineTo(144, 192)
    ctx.stroke()

    return canvas
  }

  private createTunicCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#193354' // 靛青织锦
    ctx.fillRect(0, 0, 512, 512)

    // 锦缎经纬暗纹
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.lineWidth = 2
    for (let y = 0; y < 512; y += 12) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke()
    }

    // 胸前大明水师补子 (金线刺绣海兽图)
    ctx.fillStyle = '#7f1d1d' // 茜红锦底
    ctx.fillRect(146, 120, 220, 220)
    ctx.strokeStyle = '#d4af37' // 缠枝金边
    ctx.lineWidth = 10
    ctx.strokeRect(146, 120, 220, 220)

    // 金绣文字与海水江崖
    ctx.fillStyle = '#fbbf24'
    ctx.font = 'bold 36px "KaiTi", "SimSun", serif'
    ctx.textAlign = 'center'
    ctx.fillText('大明水师', 256, 220)

    // 祥云水浪纹
    ctx.strokeStyle = '#fef08a'
    ctx.lineWidth = 4
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.arc(175 + i * 55, 285, 22, Math.PI, 0)
      ctx.stroke()
    }

    // 领对襟滚金边
    ctx.fillStyle = '#d4af37'
    ctx.fillRect(250, 0, 12, 512)
    return canvas
  }

  private createDouliCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#d4a359'
    ctx.fillRect(0, 0, 512, 512)

    // 放射状竹篾经骨
    ctx.strokeStyle = '#8c581d'
    ctx.lineWidth = 3
    const cx = 256, cy = 256
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 256, cy + Math.sin(a) * 256); ctx.stroke()
    }

    // 同心编织环
    for (let r = 24; r < 256; r += 18) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
    }

    // 笠顶大红缨络
    ctx.fillStyle = '#dc2626'
    ctx.beginPath(); ctx.arc(cx, cy, 38, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#d4af37'
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill()

    return canvas
  }

  private createSkateboardCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 1024
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, 512, 1024)
    grad.addColorStop(0, '#032042')
    grad.addColorStop(0.5, '#0077b6')
    grad.addColorStop(1, '#00b4d8')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 512, 1024)

    // 霓虹能量导轨
    ctx.strokeStyle = '#00f5d4'
    ctx.lineWidth = 12
    ctx.shadowColor = '#00f5d4'
    ctx.shadowBlur = 18
    ctx.strokeRect(32, 40, 448, 944)

    // 防滑橡胶踏板
    ctx.shadowBlur = 0
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(80, 180, 352, 260)
    ctx.fillRect(80, 580, 352, 260)

    // 金色海龙图腾
    ctx.fillStyle = '#fde047'
    ctx.font = 'bold 50px "KaiTi", "SimSun", serif'
    ctx.textAlign = 'center'
    ctx.fillText('御浪·神机', 256, 515)
    return canvas
  }

  /**
   * 构建高品质明代官澳码头：主栈桥、深水泊位平台、缆桩、货箱与大明龙旗
   */
  private createDock() {
    const dockWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a3221, roughness: 0.82, metalness: 0.05 })
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x785638, roughness: 0.75, metalness: 0.05 })
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x271910, roughness: 0.9 })
    const redFlagMat = new THREE.MeshStandardMaterial({ color: 0xc92a2a, roughness: 0.6, side: THREE.DoubleSide })

    // 1. 斜向入海主栈桥 (连接沙滩 (-19, -33) 到平台 (-7, -17))
    const walkGeo = new THREE.BoxGeometry(4.8, 0.65, 23)
    const walk = new THREE.Mesh(walkGeo, plankMat)
    walk.position.set(-13, 2.75, -25)
    walk.rotation.y = -0.58 // 偏向东南开阔海域
    walk.castShadow = true
    walk.receiveShadow = true
    this.dock.add(walk)

    // 2. 深水泊位长平台 (长 18m, 宽 8m)
    const berthGeo = new THREE.BoxGeometry(8.0, 0.65, 18.0)
    const berth = new THREE.Mesh(berthGeo, plankMat)
    berth.position.set(-5.5, 2.75, -16)
    berth.rotation.y = 0.2
    berth.castShadow = true
    berth.receiveShadow = true
    this.dock.add(berth)

    // 3. 沉入海床的坚固承重木桩群 (位于桥面下方)
    const pileGeo = new THREE.CylinderGeometry(0.32, 0.4, 12, 8)
    for (let i = 0; i < 14; i++) {
      const t = i / 13
      const px = THREE.MathUtils.lerp(-18, -6, t)
      const pz = THREE.MathUtils.lerp(-33, -16, t)
      for (const off of [-2.2, 2.2]) {
        const pile = new THREE.Mesh(pileGeo, dockWoodMat)
        pile.position.set(px + off * 0.8, -3.3, pz - off * 0.5)
        pile.castShadow = true
        this.dock.add(pile)
      }
    }

    // 4. 栈桥两侧木质护栏柱
    const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6)
    for (let i = 1; i < 12; i++) {
      const t = i / 12
      const px = THREE.MathUtils.lerp(-18, -6, t)
      const pz = THREE.MathUtils.lerp(-33, -16, t)
      for (const off of [-2.2, 2.2]) {
        const post = new THREE.Mesh(postGeo, dockWoodMat)
        post.position.set(px + off * 0.8, 3.6, pz - off * 0.5)
        post.castShadow = true
        this.dock.add(post)
      }
    }

    // 5. 系缆桩与货箱
    const bollardGeo = new THREE.CylinderGeometry(0.22, 0.28, 1.0, 8)
    for (let b = -7; b <= 7; b += 3.5) {
      const bollard = new THREE.Mesh(bollardGeo, darkWoodMat)
      bollard.position.set(-2.0, 3.4, -16 + b)
      bollard.castShadow = true
      this.dock.add(bollard)
    }

    const crateGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4)
    for (let c = 0; c < 5; c++) {
      const crate = new THREE.Mesh(crateGeo, dockWoodMat)
      crate.position.set(-7.5 + (c % 2) * 1.5, 3.65, -13 - Math.floor(c / 2) * 1.6)
      crate.castShadow = true
      this.dock.add(crate)
    }

    // 6. 码头大明水师招展战旗
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 11, 8)
    const pole = new THREE.Mesh(poleGeo, darkWoodMat)
    pole.position.set(-2.5, 7.5, -23)
    pole.castShadow = true
    this.dock.add(pole)

    const flagGeo = new THREE.PlaneGeometry(3.6, 2.2)
    const flag = new THREE.Mesh(flagGeo, redFlagMat)
    flag.position.set(-1.0, 11.5, -23)
    flag.rotation.y = Math.PI / 2
    this.dock.add(flag)

    this.scene.add(this.dock)
  }

  /**
   * 构建高品质大明水手/探险家主角模型
   */
  private createPlayer() {
    const faceTex = new THREE.CanvasTexture(this.createFaceCanvas())
    const tunicTex = new THREE.CanvasTexture(this.createTunicCanvas())
    const douliTex = new THREE.CanvasTexture(this.createDouliCanvas())
    this.textures.push(faceTex, tunicTex, douliTex)

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2caa0, roughness: 0.6 })
    const tunicMat = new THREE.MeshStandardMaterial({ map: tunicTex, roughness: 0.65 })
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x1f1915, roughness: 0.5, metalness: 0.25 })
    const douliMat = new THREE.MeshStandardMaterial({ map: douliTex, roughness: 0.6 })
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.85 })
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x452312, roughness: 0.7 })
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x221a14, roughness: 0.9 })
    const redSilkMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.55 })
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.6 })

    // 躯干 (大明水师棉甲)
    const torsoGeo = new THREE.BoxGeometry(0.72, 0.95, 0.42)
    const torso = new THREE.Mesh(torsoGeo, tunicMat)
    torso.position.y = 1.25
    torso.castShadow = true
    this.playerMesh.add(torso)

    // 金扣皮带
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.15, 0.46), leatherMat)
    belt.position.y = -0.32
    torso.add(belt)

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.48), goldMat)
    buckle.position.set(0, 0, 0.01)
    belt.add(buckle)

    // 腰间大明水师牙牌
    const token = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.05), goldMat)
    token.position.set(-0.36, -0.15, 0.15)
    token.rotation.z = 0.2
    belt.add(token)

    // 曳撒下摆 (战袍下襟)
    const skirtGeo = new THREE.BoxGeometry(0.74, 0.42, 0.44)
    const skirt = new THREE.Mesh(skirtGeo, tunicMat)
    skirt.position.y = -0.52
    torso.add(skirt)

    // 头颅与生动面容
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.42), skinMat)
    head.position.y = 0.76
    head.castShadow = true
    torso.add(head)

    // 正面脸容贴图平面
    const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.41, 0.44), faceMat)
    facePlane.position.set(0, 0, 0.211)
    head.add(facePlane)

    // 发髻 (束发为髻)
    const bun = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 8), darkWoodMat)
    bun.position.set(0, 0.28, -0.05)
    head.add(bun)

    // 精细大明竹篾斗笠
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.28, 24), douliMat)
    hat.position.y = 0.35
    hat.castShadow = true
    head.add(hat)

    // 斗笠黑漆边缘环
    const hatRim = new THREE.Mesh(new THREE.TorusGeometry(0.71, 0.02, 6, 24), darkWoodMat)
    hatRim.rotation.x = Math.PI / 2
    hatRim.position.y = -0.13
    hat.add(hatRim)

    // 斗笠红系带
    const ribbonL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.02), redSilkMat)
    ribbonL.position.set(-0.25, -0.22, 0.05)
    ribbonL.rotation.z = -0.15
    hat.add(ribbonL)

    const ribbonR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.02), redSilkMat)
    ribbonR.position.set(0.25, -0.22, 0.05)
    ribbonR.rotation.z = 0.15
    hat.add(ribbonR)

    // 左右护肩披膊
    const pauldronGeo = new THREE.BoxGeometry(0.28, 0.16, 0.44)
    const pauldronL = new THREE.Mesh(pauldronGeo, goldMat)
    pauldronL.position.set(-0.46, 0.44, 0)
    torso.add(pauldronL)

    const pauldronR = new THREE.Mesh(pauldronGeo, goldMat)
    pauldronR.position.set(0.46, 0.44, 0)
    torso.add(pauldronR)

    // 双臂与护腕手掌
    const armGeo = new THREE.BoxGeometry(0.22, 0.78, 0.22)
    armGeo.translate(0, -0.32, 0)

    const leftArm = new THREE.Mesh(armGeo, tunicMat)
    leftArm.position.set(-0.48, 0.38, 0)
    leftArm.castShadow = true
    torso.add(leftArm)

    // 左护腕与手掌
    const bracerL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.24), leatherMat)
    bracerL.position.set(0, -0.45, 0)
    leftArm.add(bracerL)
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), skinMat)
    handL.position.set(0, -0.7, 0)
    leftArm.add(handL)

    const rightArm = new THREE.Mesh(armGeo, tunicMat)
    rightArm.position.set(0.48, 0.38, 0)
    rightArm.castShadow = true
    torso.add(rightArm)

    // 右护腕与手掌
    const bracerR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.24), leatherMat)
    bracerR.position.set(0, -0.45, 0)
    rightArm.add(bracerR)
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), skinMat)
    handR.position.set(0, -0.7, 0)
    rightArm.add(handR)

    // 双腿与黑色皂靴
    const legGeo = new THREE.BoxGeometry(0.26, 0.85, 0.26)
    legGeo.translate(0, -0.4, 0)
    const leftLeg = new THREE.Mesh(legGeo, pantsMat)
    leftLeg.position.set(-0.21, 0.8, 0)
    leftLeg.castShadow = true
    this.playerMesh.add(leftLeg)

    const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.42), bootMat)
    leftBoot.position.set(0, -0.72, 0.06)
    leftLeg.add(leftBoot)

    const rightLeg = new THREE.Mesh(legGeo, pantsMat)
    rightLeg.position.set(0.21, 0.8, 0)
    rightLeg.castShadow = true
    this.playerMesh.add(rightLeg)

    const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.42), bootMat)
    rightBoot.position.set(0, -0.72, 0.06)
    rightLeg.add(rightBoot)

    this.playerLimbs = { leftArm, rightArm, leftLeg, rightLeg, torso }

    this.playerGroup.add(this.playerMesh)
    this.playerGroup.position.copy(this.playerPos)
    this.playerGroup.rotation.y = this.playerHeading
    this.scene.add(this.playerGroup)
  }

  /**
   * 构建极速水上滑板 (水翼冲浪飞板)
   */
  private createSkateboard() {
    const boardTex = new THREE.CanvasTexture(this.createSkateboardCanvas())
    this.textures.push(boardTex)
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.18, metalness: 0.65 })
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.85 })
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4 })

    // 流线型滑板板体 (长 3.0m, 宽 0.86m)
    const boardGeo = new THREE.BoxGeometry(0.86, 0.12, 3.0)
    const board = new THREE.Mesh(boardGeo, boardMat)
    board.position.y = 0.08
    board.castShadow = true
    this.skateboard.add(board)

    // 导流双水翼
    const finGeo = new THREE.BoxGeometry(0.06, 0.32, 0.46)
    const finL = new THREE.Mesh(finGeo, trimMat)
    finL.position.set(-0.35, -0.16, -1.15)
    finL.rotation.z = 0.25
    board.add(finL)

    const finR = new THREE.Mesh(finGeo, trimMat)
    finR.position.set(0.35, -0.16, -1.15)
    finR.rotation.z = -0.25
    board.add(finR)

    // 尾部喷气推进喷口
    const thrusterGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.36, 12)
    thrusterGeo.rotateX(Math.PI / 2)
    const thrusterL = new THREE.Mesh(thrusterGeo, trimMat)
    thrusterL.position.set(-0.24, 0, -1.5)
    board.add(thrusterL)

    const thrusterR = new THREE.Mesh(thrusterGeo, trimMat)
    thrusterR.position.set(0.24, 0, -1.5)
    board.add(thrusterR)

    // 侧边水流能量流光带
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 3.04), glowMat)
    glow.position.y = -0.04
    board.add(glow)

    this.skateboard.position.copy(this.skateboardPos)
    this.skateboard.visible = false
    this.scene.add(this.skateboard)
  }

  /**
   * 滑板与水面破浪喷溅粒子系统
   */
  private createWakeSpray() {
    const count = 90
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = 0
      pos[i * 3 + 1] = -100
      pos[i * 3 + 2] = 0
      this.wakeParticles.push({
        pos: new THREE.Vector3(0, -100, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.5 + Math.random() * 0.4
      })
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xe6fbff,
      size: 1.1,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    this.wakeSprayMesh = new THREE.Points(geo, mat)
    this.scene.add(this.wakeSprayMesh)
  }

  /**
   * 码头高度检测
   */
  private dockHeight(x: number, z: number): number | null {
    // 码头横向大平台 (-5.5, -16) 范围 9m x 19m
    if (x >= -10.5 && x <= -1.5 && z >= -26 && z <= -6) return 3.1
    // 入海主栈桥 (-13, -25) 连线区域
    if (x >= -20 && x <= -6 && z >= -35 && z <= -15) {
      // 距离主干道中心线距离
      const t = THREE.MathUtils.clamp(((x - (-19)) * 12 + (z - (-33)) * 16) / 400, 0, 1)
      const px = -19 + t * 12
      const pz = -33 + t * 16
      if (Math.hypot(x - px, z - pz) <= 2.6) return 3.1
    }
    return null
  }

  /**
   * 海岛陆地高度检测 (岛屿中心 (-25, 2.25, -48)，半径 32m)
   */
  private islandHeight(x: number, z: number): number {
    const dist = Math.hypot(x - (-25), z - (-48))
    if (dist > 33) return -5
    return Math.max(0, 13.5 * Math.pow(1 - dist / 32, 1.6))
  }

  /**
   * 获取指定坐标真实行走地表高度
   */
  private getSurfaceHeight(x: number, z: number): number {
    const dH = this.dockHeight(x, z)
    if (dH !== null) return dH
    const iH = this.islandHeight(x, z)
    if (iH > 0.1) return iH
    return this.spectrum.heightAt(x, z, this.time) - 0.4 // 水中涉水
  }

  /**
   * 切换水上滑板 (按 X 键)
   */
  public toggleSkateboard() {
    if (this.mode === 'skateboard') {
      this.mode = 'player'
      this.skateboard.visible = false
      this.playerMesh.position.set(0, 0, 0)
      this.playerMesh.rotation.set(0, 0, 0)
      this.playerGroup.position.copy(this.skateboardPos)
      this.playerPos.copy(this.skateboardPos)
      this.playerGroup.add(this.playerMesh)
      this.playerMesh.visible = true
      this.controls.minDistance = 2.5
      this.controls.target.copy(this.playerPos).add(new THREE.Vector3(0, 1.4, 0))
      this.callbacks.notify?.('已收起水上滑板，切换为徒步/涉水形态。')
    } else {
      // 从角色或战船进入滑板
      const currentPos = this.mode === 'boat' ? this.ship.position.clone().add(new THREE.Vector3(0, 0, 8)) : this.playerPos.clone()
      this.mode = 'skateboard'
      this.skateboardPos.copy(currentPos)
      this.skateboardHeading = this.mode === 'boat' ? this.heading : this.playerHeading
      this.skateboardSpeed = 4.0
      this.skateboard.visible = true
      // 将角色放置在滑板上呈冲浪站姿
      this.playerGroup.remove(this.playerMesh)
      this.skateboard.add(this.playerMesh)
      this.playerMesh.position.set(0, 0.12, 0)
      this.playerMesh.rotation.set(0, Math.PI / 2, 0) // 侧身冲浪姿态
      this.playerMesh.visible = true
      this.controls.minDistance = 3.5
      this.controls.target.copy(this.skateboardPos).add(new THREE.Vector3(0, 1.2, 0))
      this.callbacks.notify?.('🏄‍♂️ 已踏上水上滑板！按 W/A/S/D 极速冲浪，Shift 喷射推进！')
    }
  }

  /**
   * 切换召唤大明战船 (按 S 键)
   */
  public toggleShip() {
    if (this.mode === 'boat') {
      // 下船，切换至滑板
      this.toggleSkateboard()
      this.callbacks.notify?.('已离船停泊，切换为灵巧水上滑板。')
    } else {
      this.mode = 'boat'
      this.skateboard.visible = false
      this.ship.visible = true
      this.speed = 3.0
      // 角色站上艉楼掌舵位
      this.playerGroup.remove(this.playerMesh)
      if (this.playerMesh.parent !== this.hull) {
        this.hull.add(this.playerMesh)
      }
      this.playerMesh.position.set(0, 4.4, -6.8) // 战船艉楼舵轮位置
      this.playerMesh.rotation.set(0, Math.PI, 0)
      this.playerMesh.visible = true
      this.controls.target.copy(this.ship.position).add(new THREE.Vector3(0, 5, 0))
      this.camera.position.copy(this.ship.position).add(new THREE.Vector3(-34, 16, 30))
      this.callbacks.notify?.('⛵ 赫赫皇威！大明战船已出海！按 W/A/S/D 掌舵扬帆！')
    }
  }

  private normalizeModel(model: THREE.Object3D, length: number, draft: number) {
    let box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    model.scale.multiplyScalar(length / Math.max(size.x, size.z))
    model.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    model.position.x -= center.x
    model.position.z -= center.z
    model.position.y -= box.min.y + draft
    model.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) this.underwaterLight.applyTo(material)
      }
    })
    return model
  }

  private async loadModels() {
    this.draco.setDecoderPath('/jsm/draco/gltf/')
    const loader = new GLTFLoader().setDRACOLoader(this.draco)
    const files = ['dutch_ship_medium_2k', 'island', 'buoy', 'rocks', 'seaweed', 'grass', 'fish']
    const labels = ['木帆船', '沙滩海岛', '航道浮标', '海底礁石', '海藻', '海草', '鱼群']
    let count = 0
    try {
      const [results] = await Promise.all([Promise.all(files.map(async (name, index) => {
        const gltf = await loader.loadAsync(`/water/models/${name}.glb`)
        if (this.disposed) { disposeTree(gltf.scene); return null }
        gltf.scene.visible = false
        this.scene.add(gltf.scene)
        this.callbacks.progress(Math.round(++count / (files.length + 1) * 100), `${labels[index]}已就绪`)
        return gltf
      })), this.atmosphere.ready.then(() => {
        if (!this.disposed) this.callbacks.progress(Math.round(++count / (files.length + 1) * 100), '体积云与大气已就绪')
      })])
      if (this.disposed) return
      const [shipGLTF, islandGLTF, buoyGLTF, rocksGLTF, seaweedGLTF, grassGLTF, fishGLTF] = results
      if (!shipGLTF || !islandGLTF || !buoyGLTF || !rocksGLTF || !seaweedGLTF || !grassGLTF || !fishGLTF) return
      const shipModel = this.normalizeModel(shipGLTF.scene, 28, 1.65)
      const shipSize = new THREE.Box3().setFromObject(shipModel).getSize(new THREE.Vector3())
      if (shipSize.z > shipSize.x) shipModel.rotation.y = Math.PI / 2
      shipModel.visible = true
      this.hull.add(shipModel)

      islandGLTF.scene.rotation.x = -Math.PI / 2
      const island = this.normalizeModel(islandGLTF.scene, 66, 0)
      island.position.y = 2.25
      island.position.add(new THREE.Vector3(-25, 0, -48))
      island.visible = true
      this.shoreFoam.bake(this.renderer, island)

      const buoy = this.normalizeModel(buoyGLTF.scene, 0.35, 0.18)
      for (let i = 0; i < 8; i++) {
        const group = new THREE.Group()
        const model = buoy.clone(true)
        model.visible = true
        group.add(model)
        group.position.set(-45 + i * 13, 0, i % 2 ? -20 : 20)
        this.scene.add(group)
        this.buoys.push(group)
      }

      let seed = 8437
      const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
      for (const [source, length, amount] of [[rocksGLTF.scene, 5, 24], [seaweedGLTF.scene, 2, 42], [grassGLTF.scene, 2.6, 54]] as const) {
        this.normalizeModel(source, length, 0)
        for (let i = 0; i < amount; i++) {
          const model = source.clone(true)
          const x = (random() - 0.5) * 175, z = (random() - 0.5) * 145
          model.visible = true
          model.position.add(new THREE.Vector3(x, this.seabedHeight(x, z) - 0.1, z))
          model.rotation.y = random() * Math.PI * 2
          model.scale.multiplyScalar(0.6 + random() * 1.1)
          this.scene.add(model)
        }
      }
      const fishModel = this.normalizeModel(fishGLTF.scene, 0.8, 0)
      for (let i = 0; i < 16; i++) {
        const model = clone(fishModel)
        model.visible = true
        this.scene.add(model)
        this.fish.push(model)
        if (fishGLTF.animations.length) {
          const mixer = new THREE.AnimationMixer(model)
          mixer.clipAction(fishGLTF.animations[0]).play()
          this.mixers.push(mixer)
        }
      }
      this.updateWeatherLighting()
      this.updateEnvironment()
      this.callbacks.ready()
    } catch (error) {
      if (!this.disposed) this.callbacks.error(`场景资源加载失败，请重试。${error instanceof Error ? error.message : ''}`)
    }
  }

  private createProbes() {
    const geometry = new THREE.SphereGeometry(0.22, 10, 8)
    const material = new THREE.MeshBasicMaterial({ color: '#7cffe6', depthTest: false })
    for (const x of [-9, 0, 9]) for (const z of [-2.4, 2.4]) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.userData.offset = new THREE.Vector2(x, z)
      mesh.renderOrder = 20
      this.probes.add(mesh)
    }
    const wakeMaterial = new THREE.MeshBasicMaterial({ color: '#ffc96b', wireframe: true, depthTest: false })
    const ring = new THREE.TorusGeometry(0.5, 0.08, 4, 16)
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(ring, wakeMaterial)
      mesh.rotation.x = -Math.PI / 2
      mesh.renderOrder = 20
      this.wakeProbes.add(mesh)
    }
  }

  applySettings(next: WaterSettings) {
    const previous = this.settings
    this.settings = { ...next }
    const preset = presets[next.preset as keyof typeof presets] ?? presets['Three.js Sky Pro']
    this.material.uniforms.uWind.value = next.wind
    this.spectrum.configure(next.wind, next.wavelength, next.quality)
    this.atmosphere.configure(next.quality)
    this.atmosphere.setWeather(next.skyExposure, next.haze)
    this.material.uniforms.uWaterColor.value.set(preset.water)
    this.probes.visible = next.buoyancyProbes
    this.wakeProbes.visible = next.wakeProbes
    if (previous.dayOfYear !== next.dayOfYear || previous.timeOfDay !== next.timeOfDay) {
      this.weather.setDate(next.dayOfYear, next.timeOfDay)
    }
    this.updateWeatherLighting()
    this.callbacks.weather?.(this.weather.snapshot())
    if (previous.quality !== next.quality) {
      this.environment?.dispose()
      this.environment = null
      this.ocean.geometry.dispose()
      this.ocean.geometry = this.waterGeometry(next.quality)
      const size = qualityOptions[next.quality].reflection
      this.ocean.getRenderTarget().setSize(size, size)
    }
    if (previous.quality !== next.quality || previous.pixelRatio !== next.pixelRatio || this.width === 1) this.resize()
    if (!this.environment || previous.quality !== next.quality || previous.timeOfDay !== next.timeOfDay || previous.dayOfYear !== next.dayOfYear || previous.skyExposure !== next.skyExposure || previous.haze !== next.haze || previous.clouds !== next.clouds || previous.preset !== next.preset) {
      clearTimeout(this.environmentTimer)
      this.environmentTimer = setTimeout(() => this.updateEnvironment(), 200)
    }
  }

  private updateWeatherLighting(immediate = true) {
    const sun = this.weather.sunDirection
    const altitude = sun.y
    const daylight = THREE.MathUtils.smoothstep(altitude, -0.12, 0.22)
    const sunset = (1 - THREE.MathUtils.smoothstep(Math.abs(altitude), 0.02, 0.45)) * daylight
    this.atmosphere.setLighting(sun, this.settings.clouds, daylight, { moon: this.weather.moonDirection, immediate })
    this.sun.position.copy(sun).multiplyScalar(170)
    this.atmosphere.sunLightColor(this.sun.color)
    const strength = Math.max(this.sun.color.r, this.sun.color.g, this.sun.color.b)
    if (strength > 0) this.sun.color.multiplyScalar(1 / strength)
    const transmission = Math.min(strength, 1) * THREE.MathUtils.smoothstep(altitude, -0.01, 0.03)
    this.sun.intensity = 3.8 * transmission * (1 - this.settings.clouds * 0.42)
    this.sun.castShadow = altitude > 0
    this.ambient.intensity = 0.45 + daylight * 1.23
    this.fill.intensity = (0.25 + daylight * 3.25) * (1 - this.settings.clouds * 0.3)
    this.ambient.color.set(daylight > 0.3 ? '#b7d7ed' : '#507299')
    this.material.uniforms.uSun.value.copy(sun)
    this.material.uniforms.uSunColor.value.copy(this.sun.color).multiplyScalar(transmission)
    this.material.uniforms.uDaylight.value = daylight
    const preset = presets[this.settings.preset as keyof typeof presets] ?? presets['Three.js Sky Pro']
    this.material.uniforms.uFog.value = preset.fog
    const fogColor = this.material.uniforms.uFogColor.value as THREE.Color
    fogColor.setRGB(0.2, 0.26, 0.33).multiplyScalar(0.035 + daylight * 0.965)
    fogColor.lerp(new THREE.Color('#d79873'), sunset * 0.26)
    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(fogColor, preset.fog)
  }

  getWeather(): WeatherSnapshot { return this.weather.snapshot() }

  setWeatherDate(dayOfYear: number, timeOfDay: number) {
    this.weather.setDate(dayOfYear, timeOfDay)
    this.settings.dayOfYear = this.weather.dayOfYear
    this.settings.timeOfDay = this.weather.timeOfDay
    this.updateWeatherLighting()
    this.callbacks.weather?.(this.weather.snapshot())
    clearTimeout(this.environmentTimer)
    this.environmentTimer = setTimeout(() => this.updateEnvironment(), 150)
  }

  private updateEnvironment(refreshSky = true) {
    if (this.disposed || !this.atmosphere.isReady) return
    if (refreshSky) this.atmosphere.update(this.weather.cloudTime, true, this.time)
    this.environmentGenerator ??= new THREE.PMREMGenerator(this.renderer)
    this.environment = this.environmentGenerator.fromCubemap(this.atmosphere.texture, this.environment)
    this.scene.environment = this.environment.texture
    this.lastEnvironmentUpdate = this.time
  }

  setMode(mode: CameraMode) {
    this.mode = mode
    this.keys.clear()
    this.controls.enablePan = mode === 'orbit'
    this.controls.minDistance = mode === 'fly' ? 0.1 : 2.5
    if (mode === 'fly') {
      const direction = this.camera.getWorldDirection(new THREE.Vector3())
      this.controls.target.copy(this.camera.position).addScaledVector(direction, 3)
    }
    if (mode === 'orbit') {
      this.controls.target.copy(this.ship.position).add(new THREE.Vector3(0, 5, 0))
    }
    if (mode === 'boat') {
      this.controls.target.copy(this.ship.position).add(new THREE.Vector3(0, 5, 0))
      this.camera.position.copy(this.ship.position).add(new THREE.Vector3(-34, 16, 30))
    }
    if (mode === 'player') {
      if (this.playerMesh.parent !== this.playerGroup) {
        this.playerGroup.add(this.playerMesh)
        this.playerMesh.position.set(0, 0, 0)
        this.playerMesh.rotation.set(0, 0, 0)
      }
      this.playerMesh.visible = true
      this.skateboard.visible = false
      this.controls.target.copy(this.playerPos).add(new THREE.Vector3(0, 1.4, 0))
      // 智能置于角色后方视野，朝向海域与战船
      const camOffset = new THREE.Vector3(-Math.sin(this.playerHeading) * 6.5, 3.2, -Math.cos(this.playerHeading) * 6.5)
      this.camera.position.copy(this.playerPos).add(camOffset)
    }
    if (mode === 'skateboard') {
      this.skateboard.visible = true
      if (this.playerMesh.parent !== this.skateboard) {
        this.skateboard.add(this.playerMesh)
        this.playerMesh.position.set(0, 0.12, 0)
        this.playerMesh.rotation.set(0, Math.PI / 2, 0)
      }
      this.playerMesh.visible = true
      this.controls.target.copy(this.skateboardPos).add(new THREE.Vector3(0, 1.2, 0))
      const camOffset = new THREE.Vector3(-Math.sin(this.skateboardHeading) * 7.5, 3.5, -Math.cos(this.skateboardHeading) * 7.5)
      this.camera.position.copy(this.skateboardPos).add(camOffset)
    }
    this.controls.update()
  }

  resetCamera() {
    this.ship.position.set(0, 0, 4)
    this.heading = -0.12
    this.speed = 0
    this.playerPos.set(-7.5, 3.1, -16)
    this.playerHeading = 2.35
    this.setMode('player')
    this.controls.update()
  }

  underwaterView() {
    this.setMode('fly')
    this.camera.position.set(18, -3.4, 25)
    const direction = new THREE.Vector3(0, -4.6, -15).sub(this.camera.position).normalize()
    this.controls.target.copy(this.camera.position).addScaledVector(direction, 3)
    this.controls.update()
  }

  async fullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await this.host.parentElement?.requestFullscreen()
  }

  screenshot() {
    this.render()
    this.renderer.domElement.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `ocean-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }

  private resize() {
    if (this.disposed || !this.renderer) return
    this.width = Math.max(this.host.clientWidth, 1)
    this.height = Math.max(this.host.clientHeight, 1)
    this.renderer.setPixelRatio(Math.min(this.settings.pixelRatio, 2))
    this.renderer.setSize(this.width, this.height)
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
    const dimensions = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    this.atmosphere?.setSize(dimensions.x, dimensions.y)
    this.underwaterLight.setSize(dimensions.x, dimensions.y, this.settings.quality)
    this.material?.uniforms.uResolution.value.copy(dimensions)
    const scale = qualityOptions[this.settings.quality].refraction
    this.refraction.setSize(Math.round(dimensions.x * scale), Math.round(dimensions.y * scale))
  }

  private updateMovement(delta: number) {
    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'))
    const sideways = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'))
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')

    if (this.mode === 'fly') {
      const direction = this.camera.getWorldDirection(new THREE.Vector3())
      const right = new THREE.Vector3().crossVectors(direction, this.camera.up).normalize()
      const motion = direction.multiplyScalar(forward).addScaledVector(right, sideways)
      motion.y += Number(this.keys.has('KeyE')) - Number(this.keys.has('KeyQ'))
      motion.multiplyScalar(delta * (sprint ? 45 : 15))
      this.camera.position.add(motion)
      this.controls.target.add(motion)
      const floor = this.seabedHeight(this.camera.position.x, this.camera.position.z) + 0.65
      if (this.camera.position.y < floor) {
        this.controls.target.y += floor - this.camera.position.y
        this.camera.position.y = floor
      }
    } else if (this.mode === 'player') {
      // 角色第三人称行走
      const targetSpeed = (forward !== 0 || sideways !== 0) ? (sprint ? 11.5 : 5.8) : 0
      this.playerSpeed = THREE.MathUtils.damp(this.playerSpeed, targetSpeed, 8, delta)
      
      if (forward !== 0 || sideways !== 0) {
        // 根据相机视角计算位移方向
        const camDir = new THREE.Vector3()
        this.camera.getWorldDirection(camDir)
        camDir.y = 0
        camDir.normalize()
        const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize()
        const moveDir = camDir.clone().multiplyScalar(forward).addScaledVector(camRight, sideways).normalize()
        
        this.playerPos.addScaledVector(moveDir, this.playerSpeed * delta)
        this.playerHeading = Math.atan2(moveDir.x, moveDir.z)
        
        // 镜头与控制目标平滑跟随机体
        const camFollow = moveDir.clone().multiplyScalar(this.playerSpeed * delta)
        this.camera.position.add(camFollow)
        this.controls.target.add(camFollow)
      }

      this.playerPos.y = this.getSurfaceHeight(this.playerPos.x, this.playerPos.z)
      this.playerGroup.position.copy(this.playerPos)
      this.playerGroup.rotation.y = this.playerHeading

      // 骨骼摆臂摆腿动画
      if (this.playerLimbs) {
        if (this.playerSpeed > 0.5) {
          this.playerAnim += delta * this.playerSpeed * 1.5
          const swing = Math.sin(this.playerAnim) * 0.65
          this.playerLimbs.leftArm.rotation.x = swing
          this.playerLimbs.rightArm.rotation.x = -swing
          this.playerLimbs.leftLeg.rotation.x = -swing
          this.playerLimbs.rightLeg.rotation.x = swing
          this.playerLimbs.torso.position.y = 1.25 + Math.abs(Math.sin(this.playerAnim * 2)) * 0.08
        } else {
          this.playerLimbs.leftArm.rotation.x = THREE.MathUtils.lerp(this.playerLimbs.leftArm.rotation.x, 0, delta * 6)
          this.playerLimbs.rightArm.rotation.x = THREE.MathUtils.lerp(this.playerLimbs.rightArm.rotation.x, 0, delta * 6)
          this.playerLimbs.leftLeg.rotation.x = THREE.MathUtils.lerp(this.playerLimbs.leftLeg.rotation.x, 0, delta * 6)
          this.playerLimbs.rightLeg.rotation.x = THREE.MathUtils.lerp(this.playerLimbs.rightLeg.rotation.x, 0, delta * 6)
          this.playerLimbs.torso.position.y = 1.25
        }
      }
    } else if (this.mode === 'skateboard') {
      // 水上滑板高速冲浪
      const targetSpeed = forward > 0 ? (sprint ? 24.0 : 16.0) : (forward < 0 ? -4.0 : 0)
      this.skateboardSpeed = THREE.MathUtils.damp(this.skateboardSpeed, targetSpeed, 3.5, delta)

      if (sideways !== 0) {
        this.skateboardHeading -= sideways * delta * 1.8
        this.skateboardBank = THREE.MathUtils.lerp(this.skateboardBank, sideways * 0.42, delta * 6)
      } else {
        this.skateboardBank = THREE.MathUtils.lerp(this.skateboardBank, 0, delta * 5)
      }

      const move = new THREE.Vector3(Math.sin(this.skateboardHeading), 0, Math.cos(this.skateboardHeading)).multiplyScalar(this.skateboardSpeed * delta)
      this.skateboardPos.add(move)
      this.camera.position.add(move)
      this.controls.target.add(move)

      // 采样实际波浪高度与法线贴浪
      const waveH = this.spectrum.heightAt(this.skateboardPos.x, this.skateboardPos.z, this.time)
      this.skateboardPos.y = waveH + 0.15
      
      const deltaH = (this.spectrum.heightAt(this.skateboardPos.x + 1, this.skateboardPos.z, this.time) - waveH)
      const pitch = -deltaH * 0.45

      this.skateboard.position.copy(this.skateboardPos)
      this.skateboard.rotation.set(pitch, this.skateboardHeading, this.skateboardBank, 'YXZ')

      // 尾部浪花喷射粒子
      this.updateWakeSpray(delta)
    } else if (this.mode === 'boat' && !this.settings.paused) {
      this.speed = THREE.MathUtils.damp(this.speed, forward * 7.5, 0.8, delta)
      this.heading -= sideways * delta * 0.42
      const movement = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading)).multiplyScalar(this.speed * delta)
      const candidate = this.ship.position.clone().add(movement)
      if (Math.hypot(candidate.x + 25, candidate.z + 48) > 31 && Math.hypot(candidate.x, candidate.z) < 210) {
        this.ship.position.add(movement)
        this.camera.position.add(movement)
        this.controls.target.add(movement)
      } else this.speed = 0
    } else this.speed = THREE.MathUtils.damp(this.speed, 0, 2, delta)
  }

  private updateWakeSpray(delta: number) {
    if (Math.abs(this.skateboardSpeed) < 2.0) return
    const pos = this.wakeSprayMesh.geometry.attributes.position.array as Float32Array
    const count = this.wakeParticles.length

    for (let k = 0; k < 2; k++) {
      const idx = Math.floor(Math.random() * count)
      const p = this.wakeParticles[idx]
      const offset = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, -1.2).applyEuler(this.skateboard.rotation)
      p.pos.copy(this.skateboardPos).add(offset)
      p.vel.set((Math.random() - 0.5) * 2.5, 1.2 + Math.random() * 2.0, (Math.random() - 0.5) * 2.5)
      p.life = 0
    }

    for (let i = 0; i < count; i++) {
      const p = this.wakeParticles[i]
      p.life += delta
      if (p.life < p.maxLife) {
        p.pos.addScaledVector(p.vel, delta)
        p.vel.y -= 9.8 * delta
        pos[i * 3] = p.pos.x
        pos[i * 3 + 1] = p.pos.y
        pos[i * 3 + 2] = p.pos.z
      } else {
        pos[i * 3 + 1] = -100
      }
    }
    this.wakeSprayMesh.geometry.attributes.position.needsUpdate = true
  }

  private frame = (now: number) => {
    if (this.disposed) return
    this.animation = requestAnimationFrame(this.frame)
    if (document.hidden) { this.lastFrame = 0; return }
    const delta = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 1 / 60
    this.lastFrame = now
    this.updateMovement(delta)
    this.controls.update()
    if (!this.settings.paused) this.time += delta
    if (this.weather.advance(delta, this.settings)) this.updateWeatherLighting(false)
    const { wind } = this.settings
    const heightAt = (x: number, z: number) => this.spectrum.heightAt(x, z, this.time)
    const { x, z } = this.ship.position
    this.ship.position.y = heightAt(x, z) * 0.78
    this.ship.rotation.y = this.heading
    this.hull.rotation.x = -(heightAt(x, z + 3) - heightAt(x, z - 3)) / 6 * 0.65
    this.hull.rotation.z = (heightAt(x + 8, z) - heightAt(x - 8, z)) / 16 * 0.65
    this.buoys.forEach((buoy, index) => {
      buoy.position.y = heightAt(buoy.position.x, buoy.position.z)
      buoy.rotation.z = Math.sin(this.time * 1.2 + index) * wind * 0.004
      buoy.rotation.x = Math.cos(this.time * 0.9 + index) * wind * 0.003
    })
    this.fish.forEach((fish, index) => {
      const phase = this.time * 0.12 + index * 0.6
      fish.position.set(Math.cos(phase) * (13 + index * 0.9), -3.9 + Math.sin(phase * 2 + index) * 0.7, Math.sin(phase) * 18 + 3)
      fish.rotation.y = -phase
    })
    if (!this.settings.paused) this.mixers.forEach(mixer => mixer.update(delta))
    this.probes.children.forEach(probe => {
      const offset = probe.userData.offset as THREE.Vector2
      const px = x + offset.x * Math.cos(this.heading) + offset.y * Math.sin(this.heading)
      const pz = z - offset.x * Math.sin(this.heading) + offset.y * Math.cos(this.heading)
      probe.position.set(px, heightAt(px, pz) + 0.3, pz)
    })
    this.wakeProbes.children.forEach((probe, index) => {
      const distance = 10 + Math.floor(index / 2) * 5
      const spread = (index % 2 ? 1 : -1) * distance * 0.17
      const px = x - distance * Math.cos(this.heading) + spread * Math.sin(this.heading)
      const pz = z + distance * Math.sin(this.heading) + spread * Math.cos(this.heading)
      probe.position.set(px, heightAt(px, pz) + 0.12, pz)
    })
    this.material.uniforms.uTime.value = this.time
    this.material.uniforms.uEye.value.copy(this.camera.position)
    this.material.uniforms.uBoat.value.set(x, this.heading, z)
    this.material.uniforms.uBoatSpeed.value = Math.abs(this.speed)
    this.atmosphere.update(this.weather.cloudTime, false, this.time)
    if (!this.settings.paused && (this.settings.animateTime || this.settings.animateClouds) && this.time - this.lastEnvironmentUpdate >= 0.5) {
      this.updateEnvironment(false)
    }
    this.spectrum.update(this.time, this.material.uniforms)
    this.underwaterLight.update(this.renderer, this.time, this.weather.sunDirection, this.sun.color, this.material.uniforms.uDaylight.value, this.sun.intensity / 3.8)
    this.waterLevel = heightAt(this.camera.position.x, this.camera.position.z)
    const underwater = this.camera.position.y < this.waterLevel - 0.1
    this.underwater = underwater
    const preset = presets[this.settings.preset as keyof typeof presets] ?? presets['Three.js Sky Pro']
    const fog = this.scene.fog as THREE.FogExp2
    fog.density = underwater ? 0 : preset.fog
    fog.color.copy(underwater ? new THREE.Color('#064052') : this.material.uniforms.uFogColor.value)
    this.sky.material.uniforms.uUnderwater.value = underwater ? 1 : 0
    this.render()
    if (now - this.lastWeatherStats >= 100) {
      this.callbacks.weather?.(this.weather.snapshot())
      this.lastWeatherStats = now
    }
    this.frameCount++
    if (now - this.lastStats > 500) {
      const activeSpeed = this.mode === 'boat' ? this.speed : (this.mode === 'skateboard' ? this.skateboardSpeed : this.playerSpeed)
      const activePos = this.mode === 'boat' ? { x: this.ship.position.x, z: this.ship.position.z } : (this.mode === 'skateboard' ? { x: this.skateboardPos.x, z: this.skateboardPos.z } : { x: this.playerPos.x, z: this.playerPos.z })
      const activeHeading = this.mode === 'boat' ? this.heading : (this.mode === 'skateboard' ? this.skateboardHeading : this.playerHeading)
      this.callbacks.stats(Math.round(this.frameCount * 1000 / (now - this.lastStats)), underwater, Math.abs(activeSpeed) * 1.94384, this.mode, activePos, activeHeading)
      this.frameCount = 0
      this.lastStats = now
    }
  }

  private render() {
    this.ocean.visible = false
    this.sky.material.uniforms.uUnderwater.value = 0
    this.renderer.setRenderTarget(this.refraction)
    this.renderer.render(this.scene, this.camera)
    this.ocean.visible = true
    this.sky.material.uniforms.uUnderwater.value = this.underwater ? 1 : 0
    this.renderer.setRenderTarget(this.underwater ? this.underwaterLight.target : null)
    this.renderer.render(this.scene, this.camera)
    if (this.underwater) this.underwaterLight.render(this.renderer, this.camera, this.sun, this.waterLevel)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.animation)
    clearTimeout(this.environmentTimer)
    this.events.abort()
    this.observer.disconnect()
    this.controls.dispose()
    this.keys.clear()
    this.mixers.forEach(mixer => { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()) })
    this.draco.dispose()
    this.spectrum.dispose()
    this.shoreFoam.dispose()
    this.atmosphere.dispose()
    this.underwaterLight.dispose()
    disposeTree(this.scene)
    this.textures.forEach(texture => texture.dispose())
    this.environment?.dispose()
    this.environmentGenerator?.dispose()
    this.ocean.getRenderTarget().depthTexture?.dispose()
    this.ocean.dispose()
    this.refraction.dispose()
    this.refraction.depthTexture?.dispose()
    this.sun.shadow.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }
}
