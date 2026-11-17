/*
 * @Author: 管哥 1729207740@qq.com
 * @Date: 2025-06-21 20:24:05
 * @LastEditors: 管哥 1729207740@qq.com
 * @LastEditTime: 2025-06-22 20:23:13
 * @FilePath: \vue3-threejs\src\types\index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
interface Person{
    id:number,
    name:string,
    age:number,
    salary?:number
} 
type Persons = Array<Person> 
export {type Person,type Persons} 