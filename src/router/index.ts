/*
 * @Author: 管哥哥 1729207740@qq.com
 * @Date: 2025-06-23 10:11:22
 * @LastEditors: 管哥哥 1729207740@qq.com
 * @LastEditTime: 2025-07-11 09:07:34
 * @FilePath: \vue3-threejs\src\router\index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */

import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  /*
     两种模式：history和hash
      history不带#，美观；缺点：项目上线，后端配合处理路径问题，否则404，nginx代理可以处理，见笔记
      hash带#，兼容性好，不需要处理服务器处理路径；SEO优化差
  */
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'index',
      component:() => import('@/views/index.vue'),
      children:[
        {
          path: '/about/:id/:info/:content?',
          name: 'about',
          component: () => import('@/pages/About.vue'),

          //只能处理params
          props:true
          //函数式可以query
          // props(route){
          //   return route.query  //也可以params，但是上面更方便
          // }
        },
        {
          path: '/homePage',
          name: 'homePage',
          component: () => import('@/pages/HomePage.vue'),
        }, {
          path: '/news',
          name: 'news',
          component: () => import('@/pages/News.vue'),
        },
      ]
    },
    {
      path:"/",
      redirect:"/"
    }
    // {
    //   path: '/about',
    //   name: 'about',
    //   // route level code-splitting
    //   // this generates a separate chunk (About.[hash].js) for this route
    //   // which is lazy-loaded when the route is visited.
    //   // component: () => import('../views/AboutView.vue'),
    // },
  ],
})

export default router
