<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from 'vue'
import { OceanScene } from './OceanScene'
import { WEATHER_YEAR, formatWeatherDay, normalizeLocalDate, type WeatherSnapshot } from './weather'
import { defaultSettings, rememberedSettings, presets, type CameraMode, type WaterSettings } from './settings'

const host = ref<HTMLDivElement>()
const radarCanvas = ref<HTMLCanvasElement>()
const fullChartCanvas = ref<HTMLCanvasElement>()

const settings = reactive<WaterSettings>({ ...rememberedSettings })
const weather = reactive<WeatherSnapshot>({ dayOfYear: settings.dayOfYear, timeOfDay: settings.timeOfDay, sunElevation: 0, sunAzimuth: 0 })
const mode = ref<CameraMode>('player')
const fps = ref(0)
const speed = ref(0)
const underwater = ref(false)
const loading = ref(true)
const progress = ref(0)
const loadingText = ref('正在加载海岛与木帆船')
const error = ref('')
const panelOpen = ref(false)
const toast = ref('')
const fullMapOpen = ref(false)

const playerPos = reactive({ x: -18, z: -30 })
const playerHeading = ref(0.85)

let engine: OceanScene | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined
const events = new AbortController()

const clockText = computed(() => {
  const minutes = Math.floor(weather.timeOfDay * 60 + 1e-6) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

const modeName = computed(() => {
  switch (mode.value) {
    case 'player': return '角色徒步'
    case 'skateboard': return '水上滑板冲浪'
    case 'boat': return '大明战船出海'
    case 'orbit': return '全景环绕'
    case 'fly': return '自由漫游'
    default: return '探索'
  }
})

const modeOptions: { value: CameraMode; name: string; key: string }[] = [
  { value: 'player', name: '角色徒步', key: '1' },
  { value: 'skateboard', name: '水上滑板', key: '2' },
  { value: 'boat', name: '战船出海', key: '3' },
  { value: 'orbit', name: '全景环绕', key: '4' },
  { value: 'fly', name: '自由漫游', key: '5' },
]

function selectMode(next: CameraMode) {
  mode.value = next
  engine?.setMode(next)
  notify(`切换模式：${modeName.value}`)
}

function applyPreset() {
  const preset = presets[settings.preset as keyof typeof presets]
  Object.assign(settings, { wind: preset.wind, wavelength: preset.wavelength, dayOfYear: 170, timeOfDay: preset.timeOfDay, animateTime: false, clouds: preset.clouds })
  engine?.setWeatherDate(170, preset.timeOfDay)
}

function seekWeather(event: Event, field: 'dayOfYear' | 'timeOfDay') {
  const control = event.target as HTMLInputElement
  const current = engine?.getWeather() ?? weather
  const value = control.valueAsNumber
  if (!Number.isFinite(value)) { control.value = String(current[field]); return }
  const next = normalizeLocalDate(field === 'dayOfYear' ? value : current.dayOfYear, field === 'timeOfDay' ? value : current.timeOfDay)
  engine?.setWeatherDate(next.dayOfYear, next.timeOfDay)
  Object.assign(weather, next)
  Object.assign(settings, next, { animateTime: false })
}

function toggleTimeAnimation() {
  const current = engine?.getWeather() ?? weather
  Object.assign(settings, { dayOfYear: current.dayOfYear, timeOfDay: current.timeOfDay, animateTime: !settings.animateTime })
}

function stopTimeForEdit() {
  if (!settings.animateTime) return
  const current = engine?.getWeather() ?? weather
  Object.assign(settings, { dayOfYear: current.dayOfYear, timeOfDay: current.timeOfDay, animateTime: false })
}

function reset() {
  Object.assign(settings, defaultSettings)
  engine?.setWeatherDate(defaultSettings.dayOfYear, defaultSettings.timeOfDay)
  mode.value = 'player'
  engine?.resetCamera()
  notify('场景机位已重置')
}

function dive() { mode.value = 'fly'; engine?.underwaterView() }

function notify(message: string) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.value = '', 3500)
}

function drawRadar() {
  const canvas = radarCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  const cx = w / 2, cy = h / 2
  const scale = 1.3 // 缩放比例

  ctx.clearRect(0, 0, w, h)

  // 海水背景圆底
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2)
  ctx.clip()

  ctx.fillStyle = '#0a233a'
  ctx.fillRect(0, 0, w, h)

  // 绘制中心海岛位置（世界坐标 -25, -48）
  const islandX = cx + (-25 - playerPos.x) * scale
  const islandZ = cy + (-48 - playerPos.z) * scale
  ctx.beginPath()
  ctx.arc(islandX, islandZ, 31 * scale, 0, Math.PI * 2)
  ctx.fillStyle = '#3f6738'
  ctx.fill()
  ctx.strokeStyle = '#c4b07b'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // 绘制官澳码头标志 (-12, -25)
  const dockX = cx + (-12 - playerPos.x) * scale
  const dockZ = cy + (-25 - playerPos.z) * scale
  ctx.fillStyle = '#ffd166'
  ctx.font = '10px sans-serif'
  ctx.fillText('⚓', dockX - 5, dockZ + 4)

  // 玩家箭头指示
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-playerHeading.value)
  ctx.beginPath()
  ctx.moveTo(0, -8)
  ctx.lineTo(5, 6)
  ctx.lineTo(0, 3)
  ctx.lineTo(-5, 6)
  ctx.closePath()
  ctx.fillStyle = mode.value === 'boat' ? '#ef476f' : (mode.value === 'skateboard' ? '#00f5d4' : '#ffd166')
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.2
  ctx.stroke()
  ctx.restore()

  ctx.restore()
}

function drawFullMap() {
  if (!fullMapOpen.value) return
  const canvas = fullChartCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  const cx = w / 2, cy = h / 2
  const scale = 2.4

  // 古风羊皮纸底色
  ctx.fillStyle = '#ebd6b0'
  ctx.fillRect(0, 0, w, h)

  // 经纬罗盘虚线
  ctx.strokeStyle = '#c4aa82'
  ctx.lineWidth = 0.8
  for (let x = 0; x < w; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
  }
  for (let y = 0; y < h; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // 大明下西洋主要历史地标
  const landmarks = [
    { name: '龙牙门主岛', x: -25, z: -48, r: 32 },
    { name: '满剌加海峡', x: 80, z: -110, r: 24 },
    { name: '旧港外洋', x: -110, z: 70, r: 22 },
    { name: '古里深水港', x: 140, z: 80, r: 28 },
  ]

  landmarks.forEach(l => {
    const lx = cx + l.x * scale
    const lz = cy + l.z * scale
    ctx.beginPath()
    ctx.arc(lx, lz, l.r * scale, 0, Math.PI * 2)
    ctx.fillStyle = '#7a9a60'
    ctx.fill()
    ctx.strokeStyle = '#516f3d'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.font = 'bold 13px "KaiTi", "SimSun", serif'
    ctx.fillStyle = '#8b2512'
    ctx.textAlign = 'center'
    ctx.fillText(l.name, lx, lz - l.r * scale - 4)
  })

  // 官澳码头
  const dockX = cx + (-12) * scale
  const dockZ = cy + (-25) * scale
  ctx.fillStyle = '#9c27b0'
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText('⚓ 官澳码头', dockX + 28, dockZ + 4)

  // 实时玩家船只位置
  const px = cx + playerPos.x * scale
  const pz = cy + playerPos.z * scale
  ctx.save()
  ctx.translate(px, pz)
  ctx.rotate(-playerHeading.value)
  ctx.beginPath()
  ctx.moveTo(0, -12)
  ctx.lineTo(8, 8)
  ctx.lineTo(0, 4)
  ctx.lineTo(-8, 8)
  ctx.closePath()
  ctx.fillStyle = '#d90429'
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

function initialize() {
  engine?.dispose(); engine = undefined
  error.value = ''; loading.value = true; progress.value = 0
  if (!host.value) return
  try {
    engine = new OceanScene(host.value, settings, {
      progress: (percent, label) => { progress.value = percent; loadingText.value = label },
      ready: () => {
        loading.value = false
        notify('大明海陆大世界加载就绪！按 W/A/S/D 移动，X 切换滑板，S 召唤战船，M 开启航海图')
      },
      error: message => { error.value = message; loading.value = false },
      weather: snapshot => Object.assign(weather, snapshot),
      stats: (value, submerged, knots, curMode, pos, head) => {
        fps.value = value
        underwater.value = submerged
        speed.value = knots
        if (curMode) mode.value = curMode
        if (pos) { playerPos.x = pos.x; playerPos.z = pos.z }
        if (head !== undefined) playerHeading.value = head
        drawRadar()
        drawFullMap()
      },
      notify: (msg) => notify(msg)
    })
  } catch (cause) {
    loading.value = false
    error.value = `无法初始化三维场景：${cause instanceof Error ? cause.message : String(cause)}`
  }
}

watch(settings, value => engine?.applySettings(value), { deep: true })
watch(fullMapOpen, open => {
  if (open) nextTick(() => drawFullMap())
})

onMounted(() => {
  initialize()
  window.addEventListener('keydown', event => {
    if (event.target instanceof HTMLElement && (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable)) return
    if (event.code === 'KeyM') {
      event.preventDefault()
      fullMapOpen.value = !fullMapOpen.value
    }
    const next = modeOptions.find(option => option.key === event.key)
    if (next) selectMode(next.value)
    if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); settings.paused = !settings.paused }
    if (event.key.toLowerCase() === 'h') panelOpen.value = !panelOpen.value
  }, { signal: events.signal })
})

onBeforeUnmount(() => {
  const current = engine?.getWeather() ?? weather
  Object.assign(rememberedSettings, settings, { dayOfYear: current.dayOfYear, timeOfDay: current.timeOfDay })
  events.abort(); clearTimeout(toastTimer); engine?.dispose()
})
</script>

<template>
  <section class="water-scene" aria-label="海洋场景">
    <div ref="host" class="water-canvas" />

    <!-- 视角控制面板 -->
    <aside class="camera-panel glass-panel" aria-label="视角控制">
      <div class="fps-readout"><strong :class="{ slow: fps < 30 }">{{ fps || '—' }}</strong><span>FPS</span></div>
      <div class="camera-modes">
        <button v-for="option in modeOptions" :key="option.value" :class="{ active: mode === option.value }" :aria-pressed="mode === option.value" @click="selectMode(option.value)"><b>{{ option.key }}</b><span>{{ option.name }}</span></button>
      </div>

      <div class="camera-help" v-if="mode === 'player'">
        <span>陆地行走 <kbd>W A S D</kbd></span>
        <span>疾跑加速 <kbd>Shift</kbd></span>
        <span>水上滑板 <kbd>X</kbd></span>
        <span>召唤战船 <kbd>S</kbd></span>
        <span>航海图 <kbd>M</kbd></span>
      </div>
      <div class="camera-help" v-else-if="mode === 'skateboard'">
        <span>极速冲浪 <kbd>W A S D</kbd></span>
        <span>喷射加速 <kbd>Shift</kbd></span>
        <span>收起滑板 <kbd>X</kbd></span>
        <span>冲浪航速 <em>{{ speed.toFixed(1) }} kn</em></span>
      </div>
      <div class="camera-help" v-else-if="mode === 'boat'">
        <span>战船掌舵 <kbd>W / S / A / D</kbd></span>
        <span>换乘滑板 <kbd>X</kbd></span>
        <span>航行速度 <em>{{ speed.toFixed(1) }} kn</em></span>
      </div>
      <div class="camera-help" v-else-if="mode === 'fly'">
        <span>前后 / 左右 <kbd>W A S D</kbd></span>
        <span>下潜 / 上浮 <kbd>Q / E</kbd></span>
        <span>加速漫游 <kbd>Shift</kbd></span>
      </div>
      <div class="camera-help" v-else>
        <span>旋转视角 <kbd>左键</kbd></span>
        <span>平移视角 <kbd>右键</kbd></span>
        <span>拉近 / 远离 <kbd>滚轮</kbd></span>
      </div>
      
      <button class="dive-button" @click="dive">⌁ <span>探索水下世界</span></button>
    </aside>

    <!-- 右上角雷达小地图 -->
    <aside class="radar-minimap glass-panel" aria-label="雷达小地图">
      <div class="radar-box">
        <canvas ref="radarCanvas" width="150" height="150" />
        <div class="radar-north">N</div>
        <div class="radar-tag">龙牙门·官澳</div>
      </div>
      <button class="map-open-pill" @click="fullMapOpen = !fullMapOpen">大明航海图 [M]</button>
    </aside>

    <!-- 全屏大明航海针经总图 Modal -->
    <div v-if="fullMapOpen" class="nautical-map-modal" @click.self="fullMapOpen = false">
      <div class="parchment-chart">
        <div class="chart-header">
          <span class="imperial-seal">敕命</span>
          <h2>大明太监下西洋航海针经总图</h2>
          <button class="chart-close-btn" @click="fullMapOpen = false">✕ [M键关闭]</button>
        </div>
        <div class="chart-body">
          <canvas ref="fullChartCanvas" width="840" height="520" />
        </div>
        <div class="chart-footer">
          <span>经度: {{ (103.85 + playerPos.x * 0.0002).toFixed(4) }}°E | 纬度: {{ (1.28 + playerPos.z * 0.0002).toFixed(4) }}°N</span>
          <span>当前状态：<b>{{ modeName }}</b> | 航速：<b>{{ speed.toFixed(1) }} 节</b></span>
          <div class="chart-legend">
            <span>⚓ 官澳码头</span>
            <span>⛰ 龙牙门主岛</span>
            <span>▲ 水手位置</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 场景参数面板切换按钮 -->
    <button class="panel-toggle glass-panel" :aria-expanded="panelOpen" @click="panelOpen = !panelOpen" :title="panelOpen ? '隐藏参数 H' : '显示参数 H'">{{ panelOpen ? '收起参数 ›' : '‹ 场景参数' }}</button>
    
    <aside v-show="panelOpen" class="settings-panel glass-panel" aria-label="海洋参数">
      <header class="panel-heading"><div>WATER <b>& WEATHER</b></div><span>OCEAN · ATMOSPHERE</span></header>
      <div class="settings-body">
        <label class="select-control"><span>天气预设 <small>ENVIRONMENT</small></span><select v-model="settings.preset" aria-label="环境预设" @change="applyPreset"><option v-for="(_, name) in presets" :key="name">{{ name }}</option></select></label>
        <details class="weather-group" open>
          <summary>local date <small>太阳与季节</small></summary>
          <div class="weather-content">
            <div class="weather-location">{{ WEATHER_YEAR }} · 东京 · 本地太阳时 <span>{{ formatWeatherDay(weather.dayOfYear) }}</span></div>
            <div class="weather-control">
              <label for="weather-day">dayOfYear <small>年内日期</small></label>
              <input class="number-input" type="number" min="1" max="365" step="1" :value="weather.dayOfYear" aria-label="dayOfYear 数值" @focus="stopTimeForEdit" @change="seekWeather($event, 'dayOfYear')" />
              <input id="weather-day" :value="weather.dayOfYear" aria-label="dayOfYear" type="range" min="1" max="365" step="1" :style="{ '--fill': `${(weather.dayOfYear - 1) / 364 * 100}%` }" @input="seekWeather($event, 'dayOfYear')" />
            </div>
            <div class="weather-control">
              <label for="weather-hour">timeOfDay <small>{{ clockText }}</small></label>
              <input class="number-input" type="number" min="0" max="24" step="0.1" :value="Number(weather.timeOfDay.toFixed(2))" aria-label="timeOfDay 数值" @focus="stopTimeForEdit" @change="seekWeather($event, 'timeOfDay')" />
              <input id="weather-hour" :value="weather.timeOfDay" aria-label="timeOfDay" type="range" min="0" max="24" step="0.01" :style="{ '--fill': `${weather.timeOfDay / 24 * 100}%` }" @input="seekWeather($event, 'timeOfDay')" />
            </div>
            <div class="weather-control">
              <label for="weather-speed">speed <small>播放速度</small></label><output>{{ settings.timeSpeed.toFixed(2) }}</output>
              <input id="weather-speed" v-model.number="settings.timeSpeed" aria-label="太阳时间 speed" type="range" min="-0.5" max="0.5" step="0.01" :style="{ '--fill': `${(settings.timeSpeed + 0.5) * 100}%` }" />
            </div>
            <button class="animate-button" :class="{ running: settings.animateTime }" :aria-pressed="settings.animateTime" :aria-label="settings.animateTime ? '太阳时间 stop' : '太阳时间 animate'" @click="toggleTimeAnimation">{{ settings.animateTime ? '■ stop' : '▶ animate' }}</button>
            <div class="sun-readout"><span>太阳高度 <b>{{ weather.sunElevation.toFixed(1) }}°</b></span><span>方位 <b>{{ weather.sunAzimuth.toFixed(1) }}°</b></span></div>
          </div>
        </details>
        <details class="weather-group" open>
          <summary>clouds <small>体积云</small></summary>
          <div class="weather-content">
            <label class="switch-control"><span>animate <small>云层移动</small></span><input v-model="settings.animateClouds" aria-label="体积云 animate" type="checkbox" role="switch" /><i /></label>
            <label class="range-control"><span>coverage <small>云层覆盖</small><output>{{ Math.round(settings.clouds * 100) }}%</output></span><input v-model.number="settings.clouds" aria-label="云层覆盖" type="range" min="0" max="1" step="0.01" :style="{ '--fill': `${settings.clouds * 100}%` }" /></label>
            <label class="range-control"><span>speed <small>移动速度</small><output>{{ settings.cloudSpeed.toFixed(1) }}×</output></span><input v-model.number="settings.cloudSpeed" aria-label="云层移动速度" type="range" min="0" max="5" step="0.1" :style="{ '--fill': `${settings.cloudSpeed / 5 * 100}%` }" /></label>
          </div>
        </details>
        <details class="weather-group">
          <summary>ocean <small>海况与渲染</small></summary>
          <div class="weather-content">
            <label class="select-control"><span>渲染质量 <small>QUALITY</small></span><select v-model="settings.quality" aria-label="渲染质量"><option>Low</option><option>Medium</option><option>High</option><option>Ultra</option></select></label>
            <label class="range-control"><span>风速 <small>WIND SPEED</small><output>{{ settings.wind.toFixed(1) }} m/s</output></span><input v-model.number="settings.wind" aria-label="风速" type="range" min="0" max="30" step="0.1" :style="{ '--fill': `${settings.wind / 30 * 100}%` }" /></label>
            <label class="range-control"><span>主波波长 <small>WAVELENGTH</small><output>{{ settings.wavelength }} m</output></span><input v-model.number="settings.wavelength" aria-label="主波波长" type="range" min="10" max="120" step="1" :style="{ '--fill': `${(settings.wavelength - 10) / 110 * 100}%` }" /></label>
            <label class="switch-control"><span>浮力探针 <small>BUOYANCY</small></span><input v-model="settings.buoyancyProbes" aria-label="浮力探针" type="checkbox" role="switch" /><i /></label>
            <label class="switch-control"><span>尾流探针 <small>WAKE</small></span><input v-model="settings.wakeProbes" aria-label="尾流探针" type="checkbox" role="switch" /><i /></label>
          </div>
        </details>
        <button class="primary-button" @click="reset">重置场景 <span>↺</span></button>
      </div>
    </aside>

    <div class="scene-caption"><span class="caption-rule" /><div><small>01 / 航海大世界</small><h1>大明·新郑和下西洋<span>MING DYNASTY VOYAGE</span></h1><p>{{ underwater ? '水下漫游 · Q 下潜 / E 上浮' : '波涛澎湃、水翼冲浪与宝船破浪起航' }}</p></div></div>
    <div class="scene-status"><i :class="{ paused: settings.paused }" />{{ settings.paused ? '时间已暂停' : underwater ? 'UNDERWATER' : modeName.toUpperCase() }}<span>LIVE OCEAN · WebGL 2</span></div>
    
    <Transition name="fade"><div v-if="toast" class="toast" role="status">{{ toast }}</div></Transition>
    
    <div v-if="loading || error" class="loading-overlay"><div class="loading-card glass-panel" role="status" aria-live="polite">
      <div class="loading-symbol">≈</div><h2>{{ error ? '场景加载遇到问题' : '驶向蔚蓝之境' }}</h2><p>{{ error || loadingText }}</p>
      <template v-if="!error"><div class="loading-track"><i :style="{ width: `${Math.max(progress, 4)}%` }" /></div><small>{{ progress }}% · 正在加载高精度 2K 战船与沙滩海岛</small></template>
      <button v-else class="primary-button" @click="initialize">重新加载</button>
    </div></div>
  </section>
</template>

<style scoped src="./water-scene.css"></style>

<style scoped>
/* 右上角雷达小地图 */
.radar-minimap {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 25;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  border-radius: 14px;
}

.radar-box {
  position: relative;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  border: 2px solid rgba(212, 175, 55, 0.8);
  box-shadow: 0 0 16px rgba(0, 0, 0, 0.5), inset 0 0 12px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  background: #081a2b;
}

.radar-north {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  color: #ef476f;
  font-weight: 900;
  font-size: 11px;
}

.radar-tag {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: #ffd166;
  background: rgba(0, 0, 0, 0.6);
  padding: 1px 6px;
  border-radius: 6px;
  white-space: nowrap;
}

.map-open-pill {
  margin-top: 8px;
  background: #d4af37;
  color: #2b1d0c;
  border: none;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: .2s;
}

.map-open-pill:hover {
  background: #ffd166;
}

/* 全屏大明航海图 Modal */
.nautical-map-modal {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(4, 12, 22, 0.82);
  backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.parchment-chart {
  width: 880px;
  background: #ebd6b0;
  border: 8px solid #4a3424;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: #d8be92;
  border-bottom: 2px solid #8b6238;
}

.imperial-seal {
  background: #b52b27;
  color: #fff;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
  letter-spacing: 2px;
}

.chart-header h2 {
  font-family: "KaiTi", "SimSun", serif;
  color: #3b2512;
  font-size: 22px;
  letter-spacing: 2px;
  margin: 0;
}

.chart-close-btn {
  background: #3b2512;
  color: #ffd166;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.chart-close-btn:hover {
  background: #5a391d;
}

.chart-body {
  width: 100%;
  height: 520px;
  background: #ebd6b0;
}

.chart-body canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.chart-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 24px;
  background: #d8be92;
  border-top: 2px solid #8b6238;
  font-size: 13px;
  color: #3b2512;
  font-family: monospace;
}

.chart-legend {
  display: flex;
  gap: 16px;
  font-size: 12px;
}
</style>
