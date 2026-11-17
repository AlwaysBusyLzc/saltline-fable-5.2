import { ref, reactive } from "vue";

export default function(){
    const name = ref("管")

    function modifyName(){
        name.value = "哥哥"
    }

    return{name,modifyName}     //一定要return出去
}