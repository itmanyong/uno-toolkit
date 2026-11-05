---
"@uno-pc/reactivue": patch
---

修复 `granularity: "coarse"` 的丢更新缺陷：同 groupKey 的结构块在事务 flush 去重时仅保留第一个 cell，其余块不被重收集与 bump、内容过期。现同组全部 cell 均参与刷新，「合并为一次 bump」由 React 批处理达成（实测 m=128 扇出 commit 恒 1）。由 S12 benchmark 场景首次暴露。
