/*
 * @Author: 管哥 1729207740@qq.com
 * @Date: 2026-01-28 20:38:52
 * @LastEditors: 管哥 1729207740@qq.com
 * @LastEditTime: 2026-01-29 14:53:37
 * @FilePath: \vue3-threejs\src\components\3gs.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import * as THREE from "three";
export const add = () => {
    console.log(222);
  return 2;
};

export const addGeo = () => {
  console.log("addGeo");
  
};

export const dbclick = (canvas: HTMLCanvasElement) => {
    window.addEventListener("dblclick",()=>{
        if(!document.fullscreenElement){
            console.log("全屏");
            
            canvas.requestFullscreen()
        }else{
            document.exitFullscreen()
            console.log("非全屏");

        }
    })
};
