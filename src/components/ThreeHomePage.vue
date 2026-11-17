<template>
  <div class="homepage">
    <RightControll v-bind="$attrs" />
  </div>
</template>
  <script setup lang="ts">
import RightControll from "./threePages/RightControll.vue";
</script>
<style lang="less" scoped>
.homepage {
  width: 100%;
  height: 100%;
}
</style>

