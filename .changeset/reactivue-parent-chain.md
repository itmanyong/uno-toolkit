---
"@uno-pc/reactivue": patch
---

修复 provide/inject 跨 defineComponent 组件不连通：宿主实例创建时经 InstanceContext 接通 parent 链（此前恒为 null），嵌套组件的 inject 现可沿实例链向上查找。新增父子连通与三层嵌套测试。
