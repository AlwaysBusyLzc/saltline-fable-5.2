<template>
  <div>
    <div>关于</div>
    <div>info:{{ info }}</div>
  </div>
</template>
<script setup lang="ts">
import { useRoute } from "vue-router";
import { toRefs, defineProps } from "vue";
// let route = useRoute();
// console.log("aboutRoute", route);
// let { id, info } = toRefs(route.params);

//使用props:true
defineProps(["id", "info", "content"]);
</script>