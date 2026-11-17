/*
 * @Author: 管哥哥 1729207740@qq.com
 * @Date: 2025-06-23 10:11:22
 * @LastEditors: 管哥哥 1729207740@qq.com
 * @LastEditTime: 2025-06-24 10:56:45
 * @FilePath: \vue3-threejs\src\main.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import emitter from '@/utils/emitter'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.mount('#app')
