<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const WaterScene = defineAsyncComponent(() => import('@/components/water/WaterScene.vue'))
const ThreeJS = defineAsyncComponent(() => import('@/components/ThreeJs.vue'))
const route = useRoute()
const router = useRouter()
const selected = computed(() => route.query.scene === 'lab' ? 'lab' : 'ocean')
function selectScene(scene: 'ocean' | 'lab') {
  if (selected.value !== scene) void router.replace({ query: { ...route.query, scene } })
}
</script>

<template>
  <main class="scene-workspace">
    <WaterScene v-if="selected === 'ocean'" />
    <ThreeJS v-else />
    <nav class="scene-switcher" aria-label="场景切换">
      <div class="switcher-label"><span class="scene-mark">◈</span><span>SCENES<small>场景选择</small></span></div>
      <button :class="{ selected: selected === 'ocean' }" :aria-pressed="selected === 'ocean'" @click="selectScene('ocean')"><span class="scene-icon">≈</span><span>海洋场景<small>OCEAN</small></span></button>
      <button :class="{ selected: selected === 'lab' }" :aria-pressed="selected === 'lab'" @click="selectScene('lab')"><span class="scene-icon cube">◇</span><span>功能实验室<small>THREE.JS LAB</small></span></button>
    </nav>
  </main>
</template>

<style scoped>
.scene-workspace { position: relative; width: 100%; height: 100%; overflow: hidden; background: #122739; }
.scene-switcher { position: absolute; z-index: 30; left: 50%; top: 20px; transform: translateX(-50%); display: flex; align-items: center; gap: 5px; height: 53px; padding: 5px; border: 1px solid #a2c8df33; border-radius: 11px; background: #0b1a28e6; backdrop-filter: blur(16px); box-shadow: 0 6px 22px #0013232e; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; }
.switcher-label { display: flex; align-items: center; gap: 8px; color: #96aebb; font-size: 9px; letter-spacing: 1.4px; padding: 0 14px 0 9px; border-right: 1px solid #8eb3c72b; margin-right: 3px; }
.scene-mark { color: #8fcfe9; font-size: 25px; line-height: 1; }
.scene-switcher button { height: 41px; display: flex; align-items: center; gap: 9px; padding: 0 14px; color: #9cabb9; cursor: pointer; background: transparent; border: 1px solid transparent; border-radius: 7px; font: 11px 'Segoe UI', 'Microsoft YaHei', sans-serif; text-align: left; white-space: nowrap; transition: .2s; }
.scene-switcher button.selected { border-color: #61bbe84d; background: linear-gradient(110deg, #1c4e6d, #17324c); color: #d8f2ff; }
.scene-switcher button:hover { background-color: #224157; color: white; }
.scene-switcher button:focus-visible { outline: 2px solid #80d6f5; outline-offset: 3px; }
.scene-switcher small { display: block; font-size: 7px; letter-spacing: 1px; color: #7d9fb4; margin-top: 4px; }
.switcher-label small { font-size: 8px; letter-spacing: 2px; }
.scene-icon { font-size: 28px; line-height: 1; font-weight: 300; color: #7dcde7; }
.scene-icon.cube { font-size: 27px; }
@media (max-width: 640px) { .scene-switcher { top: 12px; } .switcher-label { padding: 0 6px; } .switcher-label > span:last-child { display: none; } .scene-switcher button { padding: 0 12px; } }
</style>
