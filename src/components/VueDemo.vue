<template>
  <div class="page">
    <h2>姓名：{{name}}</h2>
    <h2>年龄：{{age}}</h2>
    <h2>性别：{{sex}}</h2>

    <button @click="changeName">修改姓名</button>
    <button @click="changeAge">修改年龄</button>
    <button @click="changeSex">修改性别</button>
    <hr />
    <div>
      姓：
      <input type="text" v-model="firstName" />
    </div>
    <div>
      名：
      <input type="text" v-model="lastName" />
    </div>
    <div>全名：{{ fullName }}</div>

    <hr />
    <h2>路由系列</h2>
    <div>
      <RouterLink to="/homePage">
        <el-button>首页</el-button>
      </RouterLink>
      <RouterLink
        :to="{
        path:'/news',
        query:{
          id:'001',
          info:'很温和'
      }}"
      >
        <el-button>新闻</el-button>
      </RouterLink>
      <!-- params只能使用name ，replace不能回退-->
      <RouterLink
        replace
        :to="{
        name:'about',
        params:{
            id:'123',
            info:'哈哈哈'
        }
      }"
      >
        <el-button>关于</el-button>
      </RouterLink>
    </div>

    <div>
      <RouterView />
    </div>

    <hr />
    <div>----------通信-----------------</div>
    <h2>子传父</h2>
    <el-button @click="getChildInfo">ref获取child信息</el-button>
    <el-button @click="getChildsInfo($refs)">获取所有子组件信息</el-button>
    <Child :name="name" :sendInfo="getInfo" ref="c1" />
    <h2>自定义子传父</h2>
    <Child @getData="getData" />
    <h2>mitt任意通信</h2>

    <Child2 ref="c2" />
  </div>
</template>
<script lang="ts" setup >
import { ref, reactive, toRefs, computed, watch, watchEffect,defineProps } from "vue";
import  {type Person,type Persons} from "@/types/index"
import { RouterLink, RouterView } from "vue-router";
import useTools from "@/hooks/useTools"
import Child from "./Chilid.vue"
import Child2 from "./Chilid2.vue"

const {modifyName} = useTools()


const props = defineProps(["person"])
//  defineProps<{person:Persons}>()
console.log("person",props.person)
const name = ref("哈哈哈");
const age = ref(18);
const obj = reactive({
  name: "嘿嘿",
  age: 18,
  sex: 0,
  prop: {
    level: "1",
    addr: "河西"
  }
});
const person : Person = {id:1,name:"管哥",age:16}
console.log("P",person);

const firstName = ref("管");
const lastName = ref("哥");
const { sex } = toRefs(obj);

//计算属性，只要变化就会调用，有缓存，只读的
const fullName = computed(() => {
  return firstName.value + lastName.value + "呵呵";
});

const fullName1 = computed({
  //可读可写了
  // 读取
  get() {
    return firstName.value + "-" + lastName.value;
  },
  // 修改
  set(val) {
    console.log("有人修改了fullName", val);
    // firstName.value = val.split("-")[0];
    // lastName.value = val.split("-")[1];
  }
});

///watch
const stopWatch = watch(age, (newVal, oldVal) => {
  console.log(newVal, oldVal);
  if (newVal > 25) {
    //结束监视
    stopWatch();
  }
});
//监视某个属性
watch(
  () => obj.name, //基本数据
  (newVal, oldVal) => {
    console.log("obj.name修改了", newVal, oldVal);
  }
);
watch(
  () => obj.prop, //对象数据这样写,也可以直接写obj.prop，但整个prop改变不会监视
  (newVal, oldVal) => {
    console.log("obj.prop修改了", newVal, oldVal);
  }
);
//******最终监视方案,这样prop内部属性以及整个prop修改都会监视
watch(
  () => obj.prop,
  (newVal, oldVal) => {
    console.log("obj.prop修改了", newVal, oldVal);
  },
  { deep: true }
);

watchEffect(() => {
  if (obj.age > 25) {
    console.log("age达到25了 ");
  }
});
const changeName = () => {
  name.value = "张三";
};
const changeAge = () => {
  age.value += 1;
};

const changeSex = () => {
  sex.value += 1;
};
//---------通信----------------
const getInfo=(info:Object)=>{
    console.log("子传父",info);
    
}
const getData=(info:Object)=>{
  console.log("触发自定义",info);
  
}

let c1 = ref()
const getChildInfo= ()=>{
  console.log("ref获取child信息：",c1.value);
  
}
const getChildsInfo=(refs:any)=>{
    console.log(refs);
    
}
</script>
<style scoped lang="less">
.page {
  width: 100%;
  height: 100%;
}
</style>
