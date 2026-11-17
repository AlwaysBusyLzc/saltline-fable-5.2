<template>
  <div class="right" ref="right">1231321</div>
</template>
  <script setup lang="ts">
import { defineProps, onMounted, ref } from "vue";

let stats = defineProps(["stats"]);

const right = ref<HTMLCanvasElement | null>(null);
onMounted(() => {});
</script>
<style lang="less" scoped>
.right {
  width: 300px;
  height: 600px;
  position: absolute;
  top: 50px;
  right: 20px;
  background-color: aquamarine;
}
</style>

