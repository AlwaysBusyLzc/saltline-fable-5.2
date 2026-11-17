<!--
 * @Author: 管哥哥 1729207740@qq.com
 * @Date: 2025-06-23 10:35:27
 * @LastEditors: 管哥哥 1729207740@qq.com
 * @LastEditTime: 2025-06-23 13:56:36
 * @FilePath: \vue3-threejs\src\pages\News.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->

<template>
  <div>
    <div>新闻系列</div>
    <div>信息:{{ info }}</div>
  </div>
</template>
<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { toRefs, onMounted } from "vue";
let route = useRoute();
console.log("route", route);
let { id, info } = toRefs(route.query);
let router = useRouter();
//自动跳转路由
onMounted(() => {
  setTimeout(() => {
    router.push({
      name: "about",
      params: {
        id: "12",
        info: "你不饿"
      }
    });
  }, 3000);
});
</script>