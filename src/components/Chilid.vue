<!--
 * @Author: 管哥哥 1729207740@qq.com
 * @Date: 2025-06-24 10:24:16
 * @LastEditors: 管哥哥 1729207740@qq.com
 * @LastEditTime: 2025-06-24 11:12:41
 * @FilePath: \vue3-threejs\src\components\Chilid.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<template>
  <div>
    <div>父组件传来的:{{ name }}</div>
    <el-button @click="sendInfo(info)">子传父</el-button>
    <el-button @click="handleName">自定义子传父</el-button>
    <el-button @click="emittName">传子2 name</el-button>
  </div>
</template>
<script setup lang="ts">
import emitter from "@/utils/emitter";
import { defineProps, reactive, defineEmits, ref, defineExpose } from "vue";
let props = defineProps(["name", "sendInfo"]);
let emit = defineEmits(["getData"]);
let info = reactive({
  name: "guan",
  age: 18
});
const handleName = () => {
  emit("getData", info);
};

let name = ref("管哈哈");
const emittName = () => {
  emitter.emit("showName", name);
};

defineExpose({ info, name, emittName });
</script>