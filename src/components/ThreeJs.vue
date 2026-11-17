<!--
 * @Author: 管哥 1729207740@qq.com
 * @Date: 2025-06-21 13:27:48
 * @LastEditors: 管哥 1729207740@qq.com
 * @LastEditTime: 2026-03-27 20:51:39
 * @FilePath: \vue3-threejs\src\components\ThreeJs.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->

<template>
  <section ref="labHost" class="legacy-scene" aria-label="功能实验室">
    <canvas ref="canvas" id="ThreeJs"></canvas>
    <aside v-if="showPage" class="lab-panel">
      <header><div><small>THREE.JS LAB</small><h1>功能实验室</h1></div><button class="close-panel" @click="showPage = false" aria-label="收起功能面板">−</button></header>
      <p class="lab-intro">选择功能分类，在场景中探索与调试</p>
      <nav class="lab-tabs" aria-label="功能分类"><button v-for="group in featureGroups" :key="group.name" :class="{ active: category === group.name }" :aria-pressed="category === group.name" @click="category = group.name">{{ group.name }}</button></nav>
      <div class="lab-actions"><button v-for="feature in featureGroups.find(group => group.name === category)?.items" :key="feature.label" @click="feature.action()"><span>{{ feature.label }}</span><b>↗</b></button></div>
      <div class="lab-note">{{ feedback || '左键旋转 · 右键平移 · 滚轮缩放 · 双击画布全屏' }}</div>
    </aside>
    <button v-else class="open-lab" @click="showPage = true">显示功能面板</button>
    <div id="tag" ref="tagElement" class="mesh-label">标签内容</div>
    <div class="lab-caption"><small>02 / THREE.JS PLAYGROUND</small><p>几何、材质、粒子与运动</p></div>
  </section>
</template>
<script setup lang="ts">
import * as THREE from "three";
import { ref, onMounted, onBeforeUnmount } from "vue";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";
import { Mesh, BufferAttribute, Scene } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
// 引入渲染器通道RenderPass
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
// 引入OutlinePass通道
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
// 引入UnrealBloomPass通道
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
// 引入GlitchPass通道
import { GlitchPass } from "three/examples/jsm/postprocessing/GlitchPass.js";
// 引入CSS2渲染器CSS2DRenderer和CSS2模型对象CSS2DObject
import {
  CSS2DRenderer,
  CSS2DObject
} from "three/examples/jsm/renderers/CSS2DRenderer.js";

import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

import { add } from "./3gs";

import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

import { gsap } from "gsap"; //动画库，和tween.js类似
import * as CANNON from "cannon"; //物理引擎

// 加载字体
const fontLoader = new FontLoader();
const texLoader = new THREE.TextureLoader();
const matcapTexture = texLoader.load("/texture/ring_9.png");

const showPage = ref(true);

const gui = new GUI({ autoPlace: false, title: "场景参数" });
const labHost = ref<HTMLElement | null>(null);
const tagElement = ref<HTMLElement | null>(null);
const category = ref("基础与模型");
const feedback = ref("");
const frameIds = new Set<number>();
const sceneEvents = new AbortController();
const ownedElements: HTMLElement[] = [];
const composers: EffectComposer[] = [];
const disposables: { dispose: () => void }[] = [];
let disposed = false;
let activeComposer: EffectComposer | null = null;
const queueFrame = (callback: FrameRequestCallback) => {
  if (disposed) return 0;
  const id = requestAnimationFrame(time => {
    frameIds.delete(id);
    if (!disposed) callback(time);
  });
  frameIds.add(id);
  return id;
};
function clearObject(root: THREE.Object3D) {
  root.traverse(object => {
    const item = object as THREE.Mesh;
    item.geometry?.dispose();
    if (item.material) for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}
onBeforeUnmount(() => {
  disposed = true;
  sceneEvents.abort();
  frameIds.forEach(cancelAnimationFrame);
  frameIds.clear();
  controls?.dispose();
  transformControl?.dispose();
  gui.destroy();
  ownedElements.forEach(element => element.remove());
  composers.forEach(composer => { composer.passes.forEach(pass => pass.dispose()); composer.dispose(); });
  disposables.forEach(value => value.dispose());
  if (scene) {
    scene.traverse(object => { gsap.killTweensOf(object.position); gsap.killTweensOf(object.rotation); });
    clearObject(scene);
  }
  matcapTexture.dispose();
  directionalLight.shadow.dispose();
  renderer?.dispose();
  renderer?.forceContextLoss();
});
let mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
let mesh1: THREE.Mesh<THREE.BoxGeometry, THREE.MeshPhongMaterial>;
let scene: Scene;
let controls: OrbitControls;
let transformControl: TransformControls;
let renderer: THREE.WebGLRenderer;
let camera: THREE.PerspectiveCamera;
//加入灯光
const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
const ambientLight = new THREE.AmbientLight(0xffffff, 3);
const setting = {
  // 速度 km/h
  speed: 60,
  // 速度换算系数 转换为米/秒
  get speedRatio() {
    return (this.speed / 3600) * 1000;
  },
  // 轮胎半径(米)
  wheelRadius: 0.3,
  // 纹理重复
  textureRepeatLength: 8,
  // 假设60fps, 每帧时间约0.016秒
  fpsTime: 0.016
};

const canvas = ref<HTMLCanvasElement | null>(null);

const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

onMounted(() => {
  if (!canvas.value || !labHost.value) return;
  labHost.value.appendChild(gui.domElement);
  canvas.value.addEventListener("dblclick", () => {
    if (!document.fullscreenElement) void labHost.value?.requestFullscreen();
    else void document.exitFullscreen();
  }, { signal: sceneEvents.signal });

  loadFontsEffect();

  // 创建3D场景对象Scene
  scene = new THREE.Scene();
  // scene.background = new THREE.Color("#ccc"); //设置背景色

  const width = window.innerWidth;
  const height = window.innerHeight;
  camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 3000); //fov、aspect、near、far
  camera.position.set(100, 100, 100);
  camera.lookAt(0, 0, 0); //看向mesh.position
  // 初始化渲染器
  renderer = new THREE.WebGLRenderer({
    antialias: true, //锯齿设置
    alpha: true,
    canvas: canvas.value // 直接使用canvas元素
  });
  renderer.setSize(width, height); //分辨率·
  renderer.setClearColor("#000", 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); //设置像素比，2已经很好了。
  renderer.render(scene, camera);

  renderer.shadowMap.enabled = true; //必须开启接受阴影
  // renderer.shadowMap.type = THREE.PCFSoftShadowMap; //软阴影，会清晰

  // 添加场景
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.background = new THREE.Color(0xbfe3dd);
  const room = new RoomEnvironment();
  const environment = pmremGenerator.fromScene(room, 0.02);
  scene.environment = environment.texture;
  disposables.push(environment);
  room.dispose();
  pmremGenerator.dispose();

  //相机控制器，监听
  controls = new OrbitControls(camera, canvas.value);
  // controls.enableDamping = true; // 启用阻尼
  controls.update();
  // controls.minPolarAngle = 0.5; // 最小绕y轴角度
  // controls.maxPolarAngle = 1.35; // 最大绕y轴角度
  // controls.zoomSpeed = 1; // 缩放速度
  // controls.addEventListener("change", () => {
  //   renderer.render(scene, camera);
  //   console.log("相机变化", camera.position);
  // });

  transformControl = new TransformControls(camera, canvas.value);
  // 当TransformControls处于“拖拽”中时，禁止OrbitControls；否则开启
  transformControl.addEventListener("dragging-changed", event => {
    controls.enabled = !event.value;
  });

  //辅助坐标线
  let xyz = new THREE.AxesHelper(150);
  scene.add(xyz);
  // 添加辅助网格与灯光
  // scene.add(new THREE.GridHelper(500, 500, 0x888888, 0x444444));

  addLight();
  addBox();
  addBox1();

  initGUI();
  initGeometry();
  initPlane();

  const { moveRoad } = createRealRoad(scene);
  addSu7();

  //画布自适应
  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    composers.forEach(composer => composer.setSize(window.innerWidth, window.innerHeight));
  }, { signal: sceneEvents.signal });
});

const addBox = () => {
  const geometry = new THREE.BoxGeometry(10, 10, 10);
  const material = new THREE.MeshBasicMaterial({
    color: "#008c8c"
    // wireframe: true
    // transparent: true, //必须开启，下面才奏效
    // opacity: 0.8
  });
  //创建网格模型
  mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(50, 20, 50);
  mesh.rotateX(60);
  scene.add(mesh);
};
const addBox1 = () => {
  //MeshBasicMaterial 材质不会受到灯光的影响。我们将他改成会受灯光影响的MeshPhongMaterial材质。
  let box1 = new THREE.BoxGeometry(10, 10, 10);
  let material1 = new THREE.MeshPhongMaterial({ color: 0x44aa88 });
  mesh1 = new THREE.Mesh(box1, material1);
  mesh1.position.set(40, 0, 0);
  mesh1.castShadow = true; //开启阴影
  scene.add(mesh1);

  const stats = new Stats();
  stats.dom.style.position = "absolute";
  stats.dom.style.top = "90px";
  stats.dom.style.left = "auto";
  stats.dom.style.right = "335px";
  labHost.value?.appendChild(stats.dom);
  ownedElements.push(stats.dom);

  const clock = new THREE.Clock();
  const animate = () => {
    stats.update(); //刷新时间

    const elapsedtime = clock.getElapsedTime();
    // mesh1.rotation.x += 0.01;
    mesh1.rotation.y += 0.005;
    mesh1.position.y = Math.sin(elapsedtime * 2) + 20;
    rotateWheel();
    if (activeComposer) activeComposer.render();
    else renderer.render(scene, camera);
    queueFrame(animate);
  };
  animate();
};
const addLight = () => {
  directionalLight.position.set(60, 60, 60);
  scene.add(directionalLight); //默认看向原点，或者修改看向对象

  ambientLight.intensity = 0.5;
  scene.add(ambientLight);
};
const initGUI = () => {
  //onChangehe和onFinishChange区别，实时触发和松开触发
  gui.domElement.style.position = "absolute";
  gui.domElement.style.right = "20px";
  gui.domElement.style.top = "90px";
  gui.domElement.style.maxHeight = "calc(100% - 115px)";
  gui.domElement.style.overflow = "auto";
  gui.domElement.style.width = "300px";
  gui
    .add(mesh1.position, "x", -100, 100)
    .name("x平移")
    .step(1);

  const options = {
    isShow: true,
    color: 0x00ffff,
    scale: 0,
    depth: 10,
    width: 10,
    height: 10,
    intensity: 0.5,
    showAmbient: true,
    showDirectionalLight: true
  };
  //显示隐藏控制
  gui
    .add(options, "isShow")
    .name("显示")
    .onChange(function(value) {
      console.log("isShow", value);
      mesh1.visible = value;
    });

  gui.add(options, "depth", 0, 100).onChange(function(value) {
    resizeBox(options);
  });
  gui.add(options, "width", 0, 100).onChange(function(value) {
    resizeBox(options);
  });
  gui.add(options, "height", 0, 100).onChange(function(value) {
    resizeBox(options);
  });
  const resizeBox = (boxObj: { depth: number; width: number; height: number }) => {
    let { depth, width, height } = boxObj;
    const newGeometry = new THREE.BoxGeometry(width, height, depth);
    mesh1.geometry.dispose(); // 释放旧几何体的内存
    mesh1.geometry = newGeometry;
  };

  // .addColor()生成颜色值改变的交互界面
  gui.addColor(options, "color").onChange(function(value) {
    mesh1.material.color.set(value);
  });

  // 参数3数据类型：数组(下拉菜单)
  gui
    .add(options, "scale", [-10, 0, 10])
    .name("y坐标")
    .onChange(function(value) {
      mesh1.position.y = value;
    });

  const matFolder = gui.addFolder("材质");
  matFolder.close(); //默认关闭还是开启
  // 光菜单
  const ambientFolder = gui.addFolder("光");
  ambientFolder
    .add(options, "showDirectionalLight")
    .name("平行光")
    .onChange(function(value) {
      directionalLight.visible = value;
    });
  // 平行光强度
  ambientFolder.add(options, "intensity", 0, 2).onChange(value => {
    directionalLight.intensity = value;
  });

  ambientFolder
    .add(options, "showAmbient")
    .name("环境光")
    .onChange(function(value) {
      ambientLight.visible = value;
    });
  // 环境光强度
  ambientFolder.add(options, "intensity", 0, 2).onChange(value => {
    // 将这个新值赋给环境光的 intensity 属性
    ambientLight.intensity = value;
  });
};

const initGeometry = () => {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    0,
    0,
    0, //顶点1坐标
    50,
    0,
    0, //顶点2坐标
    0,
    100,
    0, //顶点3坐标
    0,
    0,
    10, //顶点4坐标
    0,
    0,
    100, //顶点5坐标
    50,
    0,
    0 //顶点6坐标
  ]);
  const attr = new THREE.BufferAttribute(vertices, 3);
  geometry.attributes.position = attr;
  // const material = new THREE.PointsMaterial({
  //   color: 0xffff00,
  //   size: 10.0 //点对象像素尺寸
  // });
  // const points = new THREE.Points(geometry, material); //点模型对象
  // scene.add(points);

  //线模式
  const material = new THREE.LineBasicMaterial({
    color: 0xff0000 //线条颜色
  });
  // 创建线模型对象
  const line = new THREE.Line(geometry, material);
  // scene.add(line);
};

const initGroup = () => {
  const geometry = new THREE.BoxGeometry(5, 5, 5);
  const material = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  const material1 = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  const group = new THREE.Group();
  group.name = "网格模型test";
  const mesh1 = new THREE.Mesh(geometry, material1);
  mesh1.name = "1号测试";
  const mesh2 = new THREE.Mesh(geometry, material);
  mesh2.name = "2号测试";
  mesh1.translateZ(40);
  mesh2.translateZ(25);
  //把mesh1、mesh2型插入到组group中，作为group的子对象
  group.add(mesh1);
  group.add(mesh2);
  scene.add(group); //把group插入到场景中作为场景子对象
  // group.translateY(100);//沿着Y轴平移mesh1和mesh2的父对象，mesh1和mesh2跟着平移，group变，mesh12都跟着变了
  console.log("查看group的子对象", group.children);

  //受threejs历史影响，你会在很多别的代码中看到Object3D作为Group来使用，如果看到不用奇怪。某种程度上，你可把两者画等号，只是Group更加语义化，Object3D本身就是表示模型节点的意思。
  const mesh3 = new THREE.Mesh(geometry, material);
  const mesh4 = new THREE.Mesh(geometry, material);
  const obj = new THREE.Object3D(); //作为mesh1和mesh2的父对象
  obj.translateY(40);
  obj.add(mesh3, mesh4);
  scene.add(obj);
  //mesh也能添加mesh子对象,mesh1.add(mesh2);
};
const getByName = () => {
  const nameNode = scene.getObjectByName("1号测试");
  const randomColor = Math.random() * 0xffffff;
  if (nameNode instanceof THREE.Mesh && nameNode.material instanceof THREE.MeshLambertMaterial) {
    nameNode.material.color.setHex(randomColor);
    feedback.value = "已找到 1号测试 并更新颜色";
  } else feedback.value = "请先点击 Group 组，创建命名对象";
};
const getWorldPosition = () => {
  const worldPosition = new THREE.Vector3();
  // 获取mesh的世界坐标，你会发现mesh的世界坐标受到父对象group的.position影响
  mesh.getWorldPosition(worldPosition);
  console.log("世界坐标", worldPosition);
  console.log("本地坐标", mesh.position);
  feedback.value = `世界坐标：${worldPosition.toArray().map(value => value.toFixed(1)).join(" / ")}`;

  // const meshAxesHelper = new THREE.AxesHelper(50); //可视化mesh的局部坐标系
  // mesh.add(meshAxesHelper);
};
let isShow = ref(false);
const isShowMesh = () => {
  isShow.value = !isShow.value;
  mesh.visible = isShow.value;
  mesh.material.wireframe = !isShow.value;
};

const getTexture = () => {
  // const geometry = new THREE.PlaneGeometry(20, 10);
  const geometry = new THREE.CircleGeometry(60, 100);
  console.log("uv", geometry.attributes.uv);
  // const geometry = new THREE.BoxGeometry(100, 100, 100);
  //纹理贴图加载器TextureLoader
  const texLoader = new THREE.TextureLoader();
  // .load()方法加载图像，返回一个纹理对象Texture
  const texture = texLoader.load("./img/爆炸.png");
  const material = new THREE.MeshBasicMaterial({
    // 设置纹理贴图：Texture对象作为材质map属性的属性值
    side: THREE.DoubleSide,
    map: texture //map表示材质的颜色贴图属性
  });
  let mesh = new THREE.Mesh(geometry, material);
  // mesh.rotateX(10);
  scene.add(mesh);
};
const initPlane = () => {
  const geometry = new THREE.PlaneGeometry(200, 200);
  const texLoader = new THREE.TextureLoader();
  const texture = texLoader.load("./img/瓷砖.jpg");
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // uv两个方向纹理重复数量
  texture.repeat.set(5, 5); //5*5，注意选择合适的阵列数量
  const material = new THREE.MeshPhongMaterial({
    // 设置纹理贴图：Texture对象作为材质map属性的属性值
    side: THREE.DoubleSide,
    map: texture //map表示材质的颜色贴图属性
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotateX(-Math.PI / 2);
  mesh.receiveShadow = true;
  scene.add(mesh);
};

const addGLTF = () => {
  const loader = new GLTFLoader();
  loader.load("./model/scene.gltf", function(gltf) {
    if (disposed) { clearObject(gltf.scene); return; }
    console.log("gltf对象场景属性", gltf.scene);
    // 返回的场景对象gltf.scene插入到threejs场景中
    gltf.scene.scale.set(5, 5, 5);
    gltf.scene.position.set(20, 20, 50);
    scene.add(gltf.scene);
  });
};

const addSu7 = () => {
  // 加载su7模型
  const loader = new GLTFLoader();
  // 解压loader
  const dracoLoader = new DRACOLoader();
  disposables.push(dracoLoader);
  const dracoUrl = new URL("/jsm/draco/gltf/", import.meta.url).href;
  const carUrl = new URL("/models/mesh/sm_car.gltf", import.meta.url).href;
  dracoLoader.setDecoderPath(dracoUrl);
  loader.setDRACOLoader(dracoLoader);
  // Meshopt压缩的glTF模型
  loader.setMeshoptDecoder(MeshoptDecoder);

  loader.load(
    carUrl,
    async gltf => {
      if (disposed) { clearObject(gltf.scene); return; }
      const model = gltf.scene;
      model.position.set(20, 0, 20);
      console.log("小米：", model);

      scene.add(model);
      initModel(model);
    },
    undefined,
    e => {
      console.error(e);
    }
  );
};
// 创建马路
const createRealRoad = (scene: THREE.Scene) => {
  // 1. 创建道路平面几何体 - 调整大小以适应场景
  const roadGeometry = new THREE.PlaneGeometry(
    10,
    10 * setting.textureRepeatLength
  );

  // 2. 加载道路纹理
  const textureLoader = new THREE.TextureLoader();
  const roadTextureUrl = new URL(
    "/models/highway/highway-lanes_albedo.png",
    import.meta.url
  ).href;
  const roadTexture = textureLoader.load(roadTextureUrl);

  // 设置纹理重复
  roadTexture.wrapS = THREE.RepeatWrapping;
  roadTexture.wrapT = THREE.RepeatWrapping;
  roadTexture.repeat.set(1, setting.textureRepeatLength); // 设置纹理重复次数

  const roadMaterial = new THREE.MeshStandardMaterial({
    map: roadTexture
  });

  const road = new THREE.Mesh(roadGeometry, roadMaterial);
  road.position.set(50, 0, 20);
  road.rotation.x = -Math.PI / 2; // 使平面水平
  road.rotation.z = -Math.PI / 2; // 使平面垂直于z轴
  road.position.y = +0.1; // 略微下沉避免z-fighting

  const moveRoad = () => {
    const offset =
      (setting.speedRatio * setting.fpsTime) / setting.textureRepeatLength;
    roadTexture.offset.y += offset;
    if (roadTexture.offset.y > 1) {
      roadTexture.offset.y = 0;
    }
  };

  scene.add(road);

  return { moveRoad };
};
// 模型遍历子对象
const modelParts: THREE.Object3D<THREE.Object3DEventMap>[] = [];
// 轮子
let wheelModel: THREE.Object3D<THREE.Object3DEventMap> = null!;
// 车身材质
let bodyMat: THREE.MeshStandardMaterial | null = null;
const initModel = async (model: THREE.Group<THREE.Object3DEventMap>) => {
  // 平铺模型
  model.traverse(obj => modelParts.push(obj));
  console.info("modelParts", modelParts);
  wheelModel = modelParts[35];
  const body = modelParts[2] as THREE.Mesh;
  bodyMat = body.material as THREE.MeshStandardMaterial;

  // 海湾蓝
  // bodyMat.color = new THREE.Color('#26d6e9')

  // 璀璨洋红
  // bodyMat.color = new THREE.Color('#A62058')

  // 雅灰
  bodyMat.color = new THREE.Color("#888888");

  // @ts-ignore
  modelParts.forEach((item: THREE.Mesh) => {
    if (item.isMesh) {
      const mat = item.material as THREE.MeshStandardMaterial;
      mat.aoMap = null;
    }
  });
};

const rotateWheel = () => {
  //  v = ωr，ω = v/r
  // 角速度 = 线速度/半径
  const angularVelocity = setting.speedRatio / setting.wheelRadius;
  wheelModel?.children.forEach(item => {
    // 每帧旋转角度 = 角速度 * 帧时间
    item.rotateZ(-angularVelocity * setting.fpsTime);
  });
};

const addArc = () => {
  const geometry = new THREE.BufferGeometry(); //创建一个几何体对象
  const R = 100; //圆弧半径
  const N = 30; //分段数量
  const sp = (2 * Math.PI) / N; //两个相邻点间隔弧度
  // 批量生成圆弧上的顶点数据
  const arr = [];
  for (let i = 0; i < N; i++) {
    const angle = sp * i; //当前点弧度
    // 以坐标原点为中心，在XOY平面上生成圆弧上的顶点数据
    const x = R * Math.cos(angle);
    const y = R * Math.sin(angle);
    arr.push(x, 0, y);
  }
  //类型数组创建顶点数据
  const vertices = new Float32Array(arr);
  // 创建属性缓冲区对象
  //3个为一组，表示一个顶点的xyz坐标
  const attribue = new THREE.BufferAttribute(vertices, 3);
  // 设置几何体attributes属性的位置属性
  geometry.attributes.position = attribue;

  // 线材质
  const material = new THREE.LineBasicMaterial({
    color: 0xff0000 //线条颜色
  });
  // 创建线模型对象   构造函数：Line、LineLoop、LineSegments
  // const line = new THREE.Line(geometry, material);
  const line = new THREE.LineLoop(geometry, material); //线条模型对象
  scene.add(line);
};

const addVertexColor = () => {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([0, 0, 0, 20, 20, 20, 0, 20, 20]);
  geometry.attributes.position = new THREE.BufferAttribute(vertices, 3);
  const colors = new Float32Array([1, 0, 0, 0, 0, 1, 0, 1, 0]);
  geometry.attributes.color = new THREE.BufferAttribute(colors, 3);
  const material = new THREE.PointsMaterial({
    // color: "#008c8c", 上面设置了color，这里不用了,必须打开vertexColors
    vertexColors: true,
    size: 10
  });
  const points = new THREE.Points(geometry, material); //点模型对象
  scene.add(points);

  const materialLine = new THREE.LineBasicMaterial({
    vertexColors: true, //使用顶点颜色渲染
    linewidth: 30.0
  });
  const line = new THREE.Line(geometry, materialLine);
  scene.add(line);
};

const addCamera = () => {
  // 三维样条曲线
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-50, 20, 90),
    new THREE.Vector3(-10, 40, 40),
    new THREE.Vector3(10, 10, 10),
    new THREE.Vector3(60, 60, 0),
    new THREE.Vector3(90, 40, 60),
    new THREE.Vector3(120, 30, 30)
  ]);
  // 样条曲线path作为TubeGeometry参数生成管道
  const geometry = new THREE.TubeGeometry(path, 200, 5, 30);
  const material = new THREE.MeshLambertMaterial({
    color: "#008c8c",
    side: THREE.DoubleSide //双面显示看到管道内壁
  });
  const mesh = new THREE.Mesh(geometry, material);
  // 从曲线上等间距获取一定数量点坐标
  scene.add(mesh);

  const pointsArr = path.getSpacedPoints(500);

  // 渲染循环
  let i = 0; //在渲染循环中累加变化
  function render() {
    if (i < pointsArr.length - 1) {
      // 相机位置设置在当前点位置
      camera.position.copy(pointsArr[i]);
      // 曲线上当前点pointsArr[i]和下一个点pointsArr[i+1]近似模拟当前点曲线切线
      // 设置相机观察点为当前点的下一个点，相机视线和当前点曲线切线重合
      camera.lookAt(pointsArr[i + 1]);
      i += 1; //调节速度
    } else {
      i = 0;
    }
    renderer.render(scene, camera);
    queueFrame(render);
  }
  // render();
};

const addSprite = () => {
  // 1. 创建纹理
  const texture = new THREE.TextureLoader().load("./img/爆炸.png");

  // 2. 创建Sprite材质（可设置透明、颜色等）
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    color: 0xffffff
  });

  // 3. 生成Sprite并添加到场景
  const sprite = new THREE.Sprite(material);
  sprite.position.set(20, 20, 20);
  sprite.scale.set(20, 20, 1); // 设置缩放（宽、高）
  scene.add(sprite);

  const group = new THREE.Group();
  for (let i = 0; i < 16000; i++) {
    // 精灵模型共享材质
    const sprite = new THREE.Sprite(material);
    group.add(sprite);
    // 设置精灵模型位置，在长方体空间上上随机分布
    const x = 10 * (Math.random() - 0.5);
    const y = 20 * Math.random();
    const z = 10 * (Math.random() - 0.5);
    sprite.position.set(x, y, z);
  }

  // const clock = new THREE.Clock();
  // function loop() {
  //   // loop()两次执行时间间隔
  //   const t = clock.getDelta();
  //   group.children.forEach(sprite => {
  //     // 雨滴的y坐标每次减t*60
  //     sprite.position.y -= t * 60;
  //     if (sprite.position.y < 0) {
  //       sprite.position.y = 600;
  //     }
  //   });
  //   queueFrame(loop);
  // }
  // loop();
};

const addOutline = () => {
  // 创建后处理对象EffectComposer，WebGL渲染器作为参数
  if (activeComposer) {
    activeComposer.passes.forEach(pass => pass.dispose());
    activeComposer.dispose();
    composers.splice(composers.indexOf(activeComposer), 1);
  }
  const composer = new EffectComposer(renderer);
  activeComposer = composer;
  composers.push(composer);
  // 创建一个渲染器通道，场景和相机作为参数
  const renderPass = new RenderPass(scene, camera);
  // 设置renderPass通道
  composer.addPass(renderPass);

  // OutlinePass第一个参数v2的尺寸和canvas画布保持一致
  const v2 = new THREE.Vector2(window.innerWidth, window.innerHeight);
  const outlinePass = new OutlinePass(v2, scene, camera);
  // outlinePass.selectedObjects = [mesh1];
  // 多个模型对象
  outlinePass.selectedObjects = [mesh1, mesh];
  outlinePass.visibleEdgeColor.set(0xffff00); //模型描边颜色，默认白色
  outlinePass.edgeThickness = 8; //高亮发光描边厚度
  outlinePass.edgeStrength = 8; //高亮描边发光强度
  outlinePass.pulsePeriod = 5; //模型闪烁频率控制，默认0不闪烁
  composer.addPass(outlinePass);

  // The shared scene loop renders this pipeline.
};

const addBloom = () => {
  // 添加一个会发光的物体
  const geometry = new THREE.SphereGeometry(1, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 1
  });
  const sphere = new THREE.Mesh(geometry, material);
  scene.add(sphere);

  if (activeComposer) {
    activeComposer.passes.forEach(pass => pass.dispose());
    activeComposer.dispose();
    composers.splice(composers.indexOf(activeComposer), 1);
  }
  const composer = new EffectComposer(renderer);
  activeComposer = composer;
  composers.push(composer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomParams = {
    exposure: 1,
    bloomStrength: 0.3,
    bloomThreshold: 0.5,
    bloomRadius: 0.5
  };

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    bloomParams.bloomStrength,
    bloomParams.bloomRadius,
    bloomParams.bloomThreshold
  );
  composer.addPass(bloomPass);

  const movementConfig = {
    speed: 1,
    maxPosition: 50,
    origin: new THREE.Vector3(0, 0, 0),
    direction: 1, // 1为正向，-1为反向
    isMoving: true
  };

  // 动画循环
  function animate() {
    queueFrame(animate);

    if (!movementConfig.isMoving) {
      // The main loop renders the active post-processing pipeline.
      return;
    }
    const { speed, maxPosition, origin, direction } = movementConfig;
    // 更新位置
    sphere.position.x += speed * direction;
    sphere.position.y += speed * direction;
    // 检查是否到达边界
    if (
      direction === 1 &&
      (sphere.position.x >= maxPosition || sphere.position.y >= maxPosition)
    ) {
      // 到达最大位置，开始返回
      movementConfig.direction = -1;
      sphere.position.x = Math.min(sphere.position.x, maxPosition);
      sphere.position.y = Math.min(sphere.position.y, maxPosition);
    } else if (
      direction === -1 &&
      sphere.position.x <= origin.x &&
      sphere.position.y <= origin.y
    ) {
      // 返回原点，重新开始
      movementConfig.direction = 1;
      sphere.position.copy(origin);
    }

    // The main loop renders the active post-processing pipeline.
  }
  animate();
};

const addGlitchPass = () => {
  // 创建后处理对象EffectComposer，WebGL渲染器作为参数
  if (activeComposer) {
    activeComposer.passes.forEach(pass => pass.dispose());
    activeComposer.dispose();
    composers.splice(composers.indexOf(activeComposer), 1);
  }
  const composer = new EffectComposer(renderer);
  activeComposer = composer;
  composers.push(composer);
  // 1. 创建一个渲染器通道，场景和相机作为参数
  const renderPass = new RenderPass(scene, camera);
  // 设置renderPass通道
  composer.addPass(renderPass);

  // // 2. 创建OutlinePass通道
  // const v2 = new THREE.Vector2(window.innerWidth, window.innerHeight);
  // const outlinePass = new OutlinePass(v2, scene, camera);
  // outlinePass.selectedObjects = [mesh];
  // outlinePass.edgeThickness = 4;
  // outlinePass.edgeStrength = 6;
  // composer.addPass(outlinePass);

  // 3. 设置glitchPass通道
  const glitchPass = new GlitchPass();
  composer.addPass(glitchPass);

  // The shared scene loop renders this pipeline.
};

const addRay = () => {
  let ray = new THREE.Ray();
  ray.origin.set(0, 0, 5);
  ray.direction = new THREE.Vector3(0, -1, 0).normalize();
  const p1 = new THREE.Vector3(-10, 0, 0);
  const p2 = new THREE.Vector3(10, 0, 0);
  const p3 = new THREE.Vector3(10, 0, 10);
  const point = new THREE.Vector3(); //用来记录射线和三角形的交叉点
  // `.intersectTriangle()`计算射线和三角形是否相交叉，相交返回交点，不相交返回null
  const result = ray.intersectTriangle(p1, p2, p3, false, point);
  console.log("交叉点坐标", point);
  console.log("查看是否相交", result);
};

let pickingEnabled = false;
const handleClick = () => {
  if (!canvas.value || pickingEnabled) return;
  pickingEnabled = true;
  canvas.value.addEventListener("click", event => {
    console.log("鼠标点击:", event.clientX, event.clientY);
    const px = event.offsetX;
    const py = event.offsetY;
    const x = (px / window.innerWidth) * 2 - 1;
    const y = -(py / window.innerHeight) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    //.setFromCamera()计算射线投射器`Raycaster`的射线属性.ray
    // 形象点说就是在点击位置创建一条射线，射线穿过的模型代表选中
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const intersects = raycaster.intersectObjects(scene.children);
    console.log("射线器返回的对象", intersects);
    if (intersects.length > 0) {
      // 选中模型的第一个模型，设置为红色
      const picked = intersects[0].object;
      if (!(picked instanceof THREE.Mesh)) return;
      const pickedMaterial = Array.isArray(picked.material) ? picked.material[0] : picked.material;
      if ("color" in pickedMaterial) pickedMaterial.color.set(0xff0000);
      transformControl.attach(intersects[0].object);
      scene.add(transformControl as unknown as THREE.Object3D);
    }
  }, { signal: sceneEvents.signal });
};
const showHTMLContent = () => {
  const div = tagElement.value;
  if (!div || div.dataset.attached) return;
  div.dataset.attached = "true";
  div.style.display = "block";
  // HTML元素转化为threejs的CSS2模型对象
  const tag = new CSS2DObject(div);
  tag.position.set(-10, 0, 10);
  scene.add(tag);
  const css2Renderer = new CSS2DRenderer(); // 创建一个CSS2渲染器CSS2DRenderer
  // width, height：canvas画布宽高度
  css2Renderer.setSize(window.innerWidth, window.innerHeight);
  css2Renderer.domElement.style.position = "absolute";
  css2Renderer.domElement.style.top = "0";
  css2Renderer.domElement.style.pointerEvents = "none";
  labHost.value?.appendChild(css2Renderer.domElement);
  ownedElements.push(css2Renderer.domElement);
  window.addEventListener("resize", () => css2Renderer.setSize(window.innerWidth, window.innerHeight), { signal: sceneEvents.signal });

  function animate() {
    queueFrame(animate);
    // renderer.render(scene, camera);
    // 渲染CSS2D标签
    css2Renderer.render(scene, camera);
  }
  animate();
};
const addWorldPos = () => {
  const geometry = new THREE.SphereGeometry(1, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 1
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(50, 0, 50);
  // mesh设置一个父对象meshGroup
  const meshGroup = new THREE.Group();
  meshGroup.add(mesh);
  // mesh位置受到父对象局部坐标.positionn影响
  meshGroup.position.x = -100;
  scene.add(mesh);
};

const addKeyFrame = () => {
  let geometry = new THREE.BoxGeometry(5, 5, 5);
  let material = new THREE.MeshBasicMaterial({
    color: "#008c8c"
  });
  let mesh = new THREE.Mesh(geometry, material);
  mesh.name = "box1";
  scene.add(mesh);
  let times = [0, 3, 6];
  let values = [0, 0, 0, 20, 0, 0, 20, 0, 30];
  let posKF = new THREE.KeyframeTrack("box1.position", times, values);
  let colorKF = new THREE.KeyframeTrack(
    "box1.material.color",
    [2, 6],
    [1, 0, 0, 0, 0, 1]
  );
  let clip = new THREE.AnimationClip("test", 10, [posKF, colorKF]);
  const mixer = new THREE.AnimationMixer(mesh);
  const clipAction = mixer.clipAction(clip);
  //clipAction.clampWhenFinished = true; // 物体状态停留在动画结束的时候
  //clipAction.timeScale = 2;//2倍速
  clipAction.play(); //clipAction.stop();
  let clock = new THREE.Clock();
  function loop() {
    queueFrame(loop);
    const frameT = clock.getDelta();
    // 更新播放器相关的时间
    mixer.update(frameT);
  }
  loop();
};

const loadTexture = () => {
  const image = new Image();
  const texture = new THREE.Texture(image);
  image.onload = () => {
    if (disposed) { texture.dispose(); return; }
    texture.needsUpdate = true; //直接更新
  };
  image.src = "./img/爆炸.png";

  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    map: texture //map表示材质的颜色贴图属性
  });
  const geometry = new THREE.BoxGeometry(10, 10, 10);
  let mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
};

const loadFontsEffect = () => {
  fontLoader.load("/static/fonts/helvetiker_regular.typeface.json", font => {
    if (disposed) return;
    console.log("已经加载字体", font);
    const textParameters = {
      height: 0.2, // Three.js r157 uses height; later type declarations call it depth.
      font: font,
      size: 10,
      curveSegments: 12,
      bevelEnabled: true, // 强烈建议开启斜角，效果会好很多
      bevelThickness: 0.5, // 斜角的厚度
      bevelSize: 0.5, // 斜角的大小
      bevelSegments: 5
    };
    const textGeometry = new TextGeometry("hello", textParameters);
    // textGeometry.center(); //文字居中
    // 2. 计算几何体的边界框
    textGeometry.computeBoundingBox();

    // 3. 从边界框获取尺寸和中心点
    const boundingBox = textGeometry.boundingBox!;
    const textWidth = boundingBox.max.x - boundingBox.min.x;
    // 4. 计算需要的偏移量
    // 水平居中：向左移动宽度的一半
    const offsetX = -textWidth / 2;
    // 垂直对齐底部：向上移动min.y的相反数
    const offsetY = -boundingBox.min.y;
    // Z轴偏移量（如果需要）
    const offsetZ = 0; // 这里我们让文字的正面在Z=0平面上
    // 5. 应用平移变换到几何体本身
    textGeometry.translate(offsetX, offsetY, offsetZ);

    // textGeometry.translateZ = 2;
    const material = new THREE.MeshMatcapMaterial({
      matcap: matcapTexture
    });
    const text = new THREE.Mesh(textGeometry, material);
    scene.add(text);

    const torusGeometry = new THREE.TorusGeometry(0.3, 0.2, 16, 32);
    for (let i = 0; i < 1000; i++) {
      const torus = new THREE.Mesh(torusGeometry, material);
      torus.position.x = (Math.random() - 0.5) * 80;
      torus.position.y = (Math.random() - 0.5) * 80;
      torus.position.z = (Math.random() - 0.5) * 80;

      const rotation = Math.random() * Math.PI;
      torus.rotation.x = rotation;
      torus.rotation.y = rotation;

      const scale = Math.random();
      torus.scale.set(scale, scale, scale);
      scene.add(torus);
    }
  });
};

const addShadow = () => {
  //mesh接受阴影，render、plane和灯光阴影

  directionalLight.castShadow = true;
  // 设置阴影相机的视锥体大小，确保它能覆盖场景中的物体
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 200;
  directionalLight.shadow.camera.left = -40; // 根据你的场景大小调整
  directionalLight.shadow.camera.right = 40;
  directionalLight.shadow.camera.top = 40;
  directionalLight.shadow.camera.bottom = -40;

  const cameraHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
  scene.add(cameraHelper);

  const shadowFolder = gui.addFolder("平行光阴影");
  const cam = directionalLight.shadow.camera;
  // 相机left、right等属性变化执行.updateProjectionMatrix();
  // 相机变化了，执行CameraHelper的更新方法.update();
  shadowFolder.add(cam, "left", -500, 0).onChange(function(v) {
    cam.updateProjectionMatrix(); //相机更新投影矩阵
    cameraHelper.update(); //相机范围变化了，相机辅助对象更新
  });
  shadowFolder.add(cam, "right", 0, 500).onChange(function(v) {
    cam.updateProjectionMatrix();
    cameraHelper.update();
  });
  shadowFolder.add(cam, "top", 0, 500).onChange(function(v) {
    cam.updateProjectionMatrix();
    cameraHelper.update();
  });
  shadowFolder.add(cam, "bottom", -500, 0).onChange(function(v) {
    cam.updateProjectionMatrix();
    cameraHelper.update();
  });
  shadowFolder.add(cam, "far", 0, 1000).onChange(function(v) {
    cam.updateProjectionMatrix();
    cameraHelper.update();
  });
};

const addSpriteRain = () => {
  const texture = new THREE.TextureLoader().load("./img/yd.jpg");
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture
  });
  const group = new THREE.Group();
  for (let i = 0; i < 5000; i++) {
    const sprite = new THREE.Sprite(spriteMaterial);
    group.add(sprite);
    sprite.scale.set(1, 1, 1);

    const x = 200 * (Math.random() - 0.5);
    const y = 600 * Math.random();
    const z = 200 * (Math.random() - 0.5);
    sprite.position.set(x, y, z);
  }
  scene.add(group);
  const clock = new THREE.Clock();
  function loop() {
    // loop()两次执行时间间隔
    const t = clock.getDelta();
    group.children.forEach(sprite => {
      // 雨滴的y坐标每次减t*60
      sprite.position.y -= t * 60;
      if (sprite.position.y < 0) {
        sprite.position.y = 600;
      }
    });
    queueFrame(loop);
  }
  loop();
};

const addPointsRain = () => {
  const particleCount = 5000;
  const positions = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    // x, z 在一个平面范围内随机分布
    positions[i3] = (Math.random() - 0.5) * 200;
    // y 在整个下落高度内随机分布，以实现均匀的雨幕效果
    positions[i3 + 1] = Math.random() * 600;
    positions[i3 + 2] = (Math.random() - 0.5) * 200;
  }

  // 创建几何体
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const texture = new THREE.TextureLoader().load("./img/yd.jpg");
  const material = new THREE.PointsMaterial({
    // color: "#FF0000",
    map: texture,
    size: 0.5,
    sizeAttenuation: true, //远小近大
    depthWrite: false, // 解决透明物体排序问题，让雨滴之间不会互相遮挡
    transparent: true
    // blending: THREE.AdditiveBlending // 可选：让雨滴重叠时更亮，效果更好
  });

  const rain = new THREE.Points(geometry, material);
  scene.add(rain);

  const clock = new THREE.Clock();
  function loop() {
    const t = clock.getDelta();
    const positionsArray = rain.geometry.attributes.position.array;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // 雨滴下落
      positionsArray[i3 + 1] -= t * 60; // 只修改 y 坐标

      // 如果落到地面，重置到顶部
      if (positionsArray[i3 + 1] < 0) {
        // 让它在回到顶部时，x/z位置也随机一下，避免重复轨迹
        positionsArray[i3] = (Math.random() - 0.5) * 200;
        positionsArray[i3 + 1] = 600;
        positionsArray[i3 + 2] = (Math.random() - 0.5) * 200;
      }
    }

    rain.geometry.attributes.position.needsUpdate = true;
    queueFrame(loop);
  }
  loop();
};

const addGalaxy = () => {
  const params = {
    count: 1000,
    size: 0.2,
    radius: 5,
    branches: 3,
    spin: 1,
    random: 0.2,
    randomPower: 3,
    insideColor: "#ff6030",
    outsideColor: "#1b3984"
  };
  let geometry: THREE.BufferGeometry;
  let material: THREE.PointsMaterial;
  let points: THREE.Points | null = null;
  const loadGalaxy = () => {
    if (points !== null) {
      geometry.dispose();
      material.dispose();
      scene.remove(points);
    }

    geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(params.count * 3);
    const colors = new Float32Array(params.count * 3);

    const inside = new THREE.Color(params.insideColor);
    const outside = new THREE.Color(params.outsideColor);

    for (let i = 0; i < params.count; i++) {
      const i3 = i * 3;

      const radius = Math.random() * params.radius;
      const spinAngle = radius * params.spin;
      const branchAngle =
        ((i % params.branches) / params.branches) * Math.PI * 2;

      const randomX =
        Math.pow(Math.random(), params.randomPower) *
        (Math.random() < 0.5 ? 1 : -1);
      const randomY =
        Math.pow(Math.random(), params.randomPower) *
        (Math.random() < 0.5 ? 1 : -1);
      const randomZ =
        Math.pow(Math.random(), params.randomPower) *
        (Math.random() < 0.5 ? 1 : -1);

      positions[i3 + 0] = Math.cos(branchAngle + spinAngle) * radius + randomX; //第i组的x
      positions[i3 + 1] = randomY; //第i组的y
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ; //第i组的z

      const mixedColor = inside.clone();
      mixedColor.lerp(outside, radius / params.radius);

      colors[i3] = mixedColor.r;
      colors[i3 + 1] = mixedColor.g;
      colors[i3 + 2] = mixedColor.b;
    }
    //webgl中把数据传递进GPU中
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    material = new THREE.PointsMaterial({
      size: params.size,
      sizeAttenuation: true, //远大近小
      depthWrite: false, //深度遮挡
      blending: THREE.AdditiveBlending,
      // color: "#008c8c",
      vertexColors: true //使用顶点颜色必须开启才有效，
    });

    points = new THREE.Points(geometry, material);
    points.position.set(40, 0, -40); //推荐整体修改，不建议在position中修改
    points.scale.set(10, 10, 10);
    scene.add(points);
  };

  loadGalaxy();

  const galaxyFolder = gui.addFolder("银河系");
  galaxyFolder.open();

  galaxyFolder
    .add(params, "count")
    .min(100)
    .max(500000)
    .step(100)
    .onFinishChange(loadGalaxy);
  galaxyFolder
    .add(params, "size")
    .min(0.01)
    .max(1)
    .step(0.02)
    .onChange(loadGalaxy);
  galaxyFolder
    .add(params, "radius")
    .min(0.01)
    .max(20)
    .step(0.01)
    .onFinishChange(loadGalaxy);
  galaxyFolder
    .add(params, "branches")
    .min(2)
    .max(20)
    .step(1)
    .onFinishChange(loadGalaxy);
  galaxyFolder
    .add(params, "spin")
    .min(-5)
    .max(5)
    .step(0.01)
    .onFinishChange(loadGalaxy);
  galaxyFolder
    .add(params, "random")
    .min(0)
    .max(2)
    .step(0.01)
    .onFinishChange(loadGalaxy);
  galaxyFolder
    .add(params, "randomPower")
    .min(1)
    .max(10)
    .step(0.001)
    .onFinishChange(loadGalaxy);
  galaxyFolder.addColor(params, "insideColor").onFinishChange(loadGalaxy);
  galaxyFolder.addColor(params, "outsideColor").onFinishChange(loadGalaxy);
};

const addGsap = () => {
  // 使用GSAP动画摄像机移动
  // gsap.to(camera.position, { duration: 2, z: 10, ease: "power1.inOut" });
  // gsap.to(mesh.rotation, {
  //   duration: 5,
  //   y: "+=" + Math.PI * 2,
  //   ease: "elastic.out"
  // });
  gsap.fromTo(
    mesh.rotation,
    { y: 0 }, // 动画的起始值 (每次都强制从 0 开始)
    {
      duration: 5,
      y: Math.PI * 2, // 动画的结束值
      ease: "elastic.out"
    }
  );
};

const addCannon = () => {
  // 创建物理材质
  const groundMaterial = new CANNON.Material("ground");
  const sphereMaterial = new CANNON.Material("sphere");
  // 创建接触材质
  const contactMaterial = new CANNON.ContactMaterial(
    groundMaterial,
    sphereMaterial,
    {
      restitution: 0.5, // 反弹系数
      friction: 0.2 // 摩擦系数
    }
  );
  world.addContactMaterial(contactMaterial);

  // 创建地面刚体
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({
    mass: 0, //等于 type:CANNON.Body.STATIC,
    shape: groundShape,
    material: groundMaterial // 应用物理材质
  });
  groundBody.quaternion.setFromAxisAngle(
    new CANNON.Vec3(1, 0, 0),
    -Math.PI / 2
  );
  world.addBody(groundBody);

  // 创建球体刚体
  const sphereShape = new CANNON.Sphere(1);
  const sphereBody = new CANNON.Body({
    mass: 10,
    shape: sphereShape,
    material: sphereMaterial // 应用物理材质
    //  position: new CANNON.Vec3(0, 5, 0)
  });
  sphereBody.position.set(80, 50, 50);
  world.addBody(sphereBody);

  // 创建球体网格
  const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
  const sphereMeshMaterial = new THREE.MeshStandardMaterial({
    color: 0x3498db
  });
  const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMeshMaterial);
  scene.add(sphereMesh);

  // 时间步长
  const timeStep = 1 / 60;
  // 动画循环
  function animate() {
    queueFrame(animate);
    world.step(timeStep);
    sphereMesh.position.copy(sphereBody.position);
    sphereMesh.quaternion.copy(sphereBody.quaternion);
  }

  animate();
};
const featureGroups = [
  { name: "基础与模型", items: [
    { label: "按名称查找", action: getByName }, { label: "获取世界坐标", action: getWorldPosition },
    { label: "显示 / 隐藏", action: isShowMesh }, { label: "纹理贴图", action: getTexture },
    { label: "加载 glTF / GLB", action: addGLTF }, { label: "加载圆弧", action: addArc },
    { label: "顶点颜色", action: addVertexColor }, { label: "Group 组", action: initGroup },
    { label: "添加示例", action: () => { feedback.value = `示例返回：${add()}`; } }, { label: "加载纹理", action: loadTexture }
  ] },
  { name: "光影与特效", items: [
    { label: "阴影调试", action: addShadow }, { label: "Sprite 广告牌", action: addSprite },
    { label: "边框发光", action: addOutline }, { label: "Bloom 泛光", action: addBloom },
    { label: "Glitch 故障效果", action: addGlitchPass }
  ] },
  { name: "粒子与天气", items: [
    { label: "Sprite 雨", action: addSpriteRain }, { label: "Points 粒子雨", action: addPointsRain },
    { label: "银河系", action: addGalaxy }
  ] },
  { name: "交互与动画", items: [
    { label: "相机轨迹", action: addCamera }, { label: "射线交叉", action: addRay },
    { label: "鼠标拾取", action: handleClick }, { label: "HTML 标签", action: showHTMLContent },
    { label: "世界坐标示例", action: addWorldPos }, { label: "关键帧动画", action: addKeyFrame },
    { label: "GSAP 动画", action: addGsap }, { label: "Cannon 物理", action: addCannon }
  ] }
];
</script>

<style scoped>
.legacy-scene { position: absolute; inset: 0; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; color: #d1e6f1; }
#ThreeJs { width: 100%; height: 100%; display: block; }
.lab-panel { position: absolute; left: 20px; top: 90px; width: 310px; max-height: calc(100% - 120px); overflow: auto; box-sizing: border-box; padding: 20px; border: 1px solid #a8d9ee44; border-radius: 13px; background: #0c2032ed; box-shadow: 0 15px 40px #09233533; backdrop-filter: blur(14px); }
.lab-panel header { display: flex; align-items: center; justify-content: space-between; }
.lab-panel small { font: 9px Consolas, monospace; letter-spacing: 3px; color: #72b9df; }
.lab-panel h1 { font-size: 20px; font-weight: 400; letter-spacing: 3px; margin: 9px 0; }
.lab-intro { font-size: 11px; color: #8eaabe; margin: 6px 0 18px; }
.close-panel { background: transparent; color: #9ccbe0; font-size: 24px; border: 0; cursor: pointer; }
.lab-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding-bottom: 17px; border-bottom: 1px solid #7fa1b22b; }
.lab-tabs button { padding: 9px 0; font-size: 11px; color: #8caabb; background: #061421; border: 1px solid transparent; border-radius: 5px; cursor: pointer; }
.lab-tabs button.active { color: #bceaff; border-color: #3b819f; background: #1c4560; }
.lab-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 18px 0; }
.lab-actions button { display: flex; align-items: center; justify-content: space-between; min-height: 44px; padding: 8px 10px; background: #18364b; color: #c8dfec; border: 1px solid #6f9eb42b; border-radius: 5px; font-size: 11px; cursor: pointer; text-align: left; }
.lab-actions b { color: #6091ad; font-weight: 400; }
.lab-actions button:hover { background: #275c7a; border-color: #6ab5dc; }
.lab-note { font-size: 10px; line-height: 1.8; color: #83a4b9; padding-top: 10px; border-top: 1px solid #7fa1b22b; }
.open-lab { position: absolute; top: 90px; left: 20px; border: 1px solid #86c4e333; background: #16334a; color: #c4eaff; padding: 12px 20px; border-radius: 7px; cursor: pointer; }
.mesh-label { display: none; background: #09263f; color: #bceaff; border: 1px solid #69accc; padding: 7px 12px; border-radius: 5px; }
.lab-caption { position: absolute; bottom: 24px; left: 25px; color: #12354a; pointer-events: none; }
.lab-caption small { font: 9px Consolas, monospace; letter-spacing: 2px; }
.lab-caption p { font-size: 13px; letter-spacing: 2px; }
button:focus-visible { outline: 2px solid #8ddfff; outline-offset: 3px; }
@media (max-width: 700px) { .lab-panel { width: 270px; left: 12px; } .legacy-scene :deep(.lil-gui) { right: 12px !important; width: 220px !important; top: auto !important; bottom: 15px; max-height: 32% !important; } }
</style>
