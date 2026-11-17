<!--
 * @Author: 管哥哥 1729207740@qq.com
 * @Date: 2025-06-24 10:24:16
 * @LastEditors: 管哥哥 1729207740@qq.com
 * @LastEditTime: 2025-06-24 14:13:07
 * @FilePath: \vue3-threejs\src\components\Chilid.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<template>
  <div>
    <div>子1组件传来的：{{ name }}</div>
  </div>
</template>
<script setup lang="ts">
import { defineProps, reactive, defineEmits, ref, defineExpose } from "vue";
import emitter from "@/utils/emitter";
let name = ref("121");
emitter.on("showName", newName => {
  console.log("showName", newName);
  if (typeof newName === "string") name.value = newName;
});

defineExpose({ name });
</script>
