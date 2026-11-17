/*
 * @Author: 管哥 1729207740@qq.com
 * @Date: 2025-06-21 10:48:22
 * @LastEditors: gaun 1729207740@qq.com
 * @LastEditTime: 2026-09-28 15:13:15
 * @FilePath: \vue3-threejs\vite.config.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { fileURLToPath, URL } from 'node:url'

import { defineConfig,loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    vue(),
    // vueDevTools(), vue插件，不需要的
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port:3003
  }

})
