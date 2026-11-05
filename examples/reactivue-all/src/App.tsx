import * as React from "react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { computed, defineComponent, onMounted, ref } from "@uno-pc/reactivue";
// VueUse 组合式函数从 @vueuse/core 导入；其内部 `import { ref, watch } from "vue"`
// 会被 ReactivueRsbuild 注入的 alias 指向 @uno-pc/reactivue/compat。
import { useNow, useToggle } from "@vueuse/core";
import "./App.css";

/* ------------------------------------------------------------------ */
/* 1. 文本通道：TextBinding vs React setState                          */
/* ------------------------------------------------------------------ */

/** 对照组：普通 React 组件，每次点击整树重渲染。 */
function NaiveCounter(): React.ReactElement {
  const [count, setCount] = useState(0);
  const renders = useRef(0);
  renders.current += 1;
  return (
    <div className="demo-box">
      <span className="badge">React setState</span>
      <p>count: {count}</p>
      <button onClick={() => setCount((value) => value + 1)}>+1</button>
      <p className="metric">
        本组件 React 渲染次数：<strong>{renders.current}</strong>
      </p>
      <p className="hint">每次 +1，整个组件函数重新执行。</p>
    </div>
  );
}

/** 实验组：defineComponent + ref，文本插值被编译为 TextBinding 直写。 */
const FineCounter = defineComponent(() => {
  const count = ref(0);
  return (
    <div className="demo-box">
      <span className="badge">TextBinding 直写</span>
      <p>count: {count.value}</p>
      <button onClick={() => (count.value += 1)}>+1</button>
      <p className="hint">
        块更新只写 Text 节点：宿主 React 渲染次数不增长（看右侧指标 / react-scan
        无高亮）。
      </p>
    </div>
  );
});

/** 包一层统计「宿主 React 渲染次数」：块更新不经过它。 */
function HostRenderMeter({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const renders = useRef(0);
  renders.current += 1;
  return (
    <div className="demo-box meter">
      {children}
      <p className="metric">
        宿主 React 渲染次数：<strong>{renders.current}</strong>
        （挂载时含 StrictMode 双调用，之后恒定）
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. computed：依赖缓存                                               */
/* ------------------------------------------------------------------ */

const ComputedDemo = defineComponent(() => {
  const count = ref(0);
  const other = ref(0);
  const evaluations = ref(0);
  const doubled = computed(() => {
    evaluations.value += 1;
    return count.value * 2;
  });
  return (
    <div className="demo-box">
      <span className="badge">computed</span>
      <p>
        count: {count.value} · doubled: {doubled.value} · computed 求值{" "}
        {evaluations.value} 次
      </p>
      <button onClick={() => (count.value += 1)}>
        count +1（doubled 重算）
      </button>
      <button
        onClick={() => {
          other.value += 1;
          console.log(other.value);
        }}
      >
        other +1（doubled 不重算）
      </button>
      <p className="hint">
        other 不在 doubled 的依赖里：点它时求值计数不变，且不产生任何 DOM 写入。
      </p>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* 3. 结构通道：Block 走 React render + reconcile                      */
/* ------------------------------------------------------------------ */

const ListDemo = defineComponent(() => {
  const items = ref<string[]>(["Alpha", "Beta", "Gamma"]);
  return (
    <div className="demo-box">
      <span className="badge">Block 结构块</span>
      <ul>
        {items.value.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <button
        onClick={() => items.value.push(`Item ${items.value.length + 1}`)}
      >
        追加一项
      </button>
      <button onClick={() => items.value.pop()}>移除末项</button>
      <p className="hint">
        数组表达式是「结构块」：更新走 React render + reconcile（react-scan
        会高亮该块）， 与文本直写是两条通道。
      </p>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* 4. v-memo：额外触发源（与 Vue 原语义相反）                           */
/* ------------------------------------------------------------------ */

const MemoDemo = defineComponent(() => {
  const message = ref("hello");
  const epoch = ref(0);
  // 非响应式：响应式通道对它不可见；只有块被重渲染（如 deps 变化）才会读到新值。
  let renderNonce = 0;
  return (
    <div className="demo-box">
      <span className="badge">MemoBlock</span>
      <p>普通块（细粒度直写）：{message.value}</p>
      <p v-memo={[epoch.value]}>
        v-memo 块：{message.value} · renderNonce={renderNonce}
      </p>
      <button onClick={() => (message.value += "!")}>
        改 message（块内依赖变化）
      </button>
      <button
        onClick={() => {
          renderNonce += 1;
          epoch.value += 1;
        }}
      >
        epoch +1（deps 变化，整块刷新）
      </button>
      <p className="hint">
        本包 v-memo 是「额外触发源」：deps 变化必然整块刷新（renderNonce
        递增是证物——
        它不是响应式依赖，普通块永远不会因它更新）；块内自动收集的依赖变化同样刷新
        （不是 Vue 的「deps 不变就跳过更新」，v-memo 空数组不等价 v-once）。
      </p>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* 5. VueUse 组合式函数（compat 桥）                                   */
/* ------------------------------------------------------------------ */

const VueUseDemo = defineComponent(() => {
  const [enabled, toggle] = useToggle(false);
  // VueUse 15 的 useNow 已移除 interval 选项，默认调度每秒更新。
  const now = useNow();
  return (
    <div className="demo-box">
      <span className="badge">VueUse via compat</span>
      <p>useToggle: {enabled.value ? "ON" : "OFF"}</p>
      <button onClick={() => toggle()}>toggle</button>
      <p>useNow: {now.value.toLocaleTimeString()}</p>
      <p className="hint">
        VueUse 内部 import 自 "vue"，经 alias 落到 ./compat；响应式引擎就是
        @vue/reactivity 本体，因此 useNow 的每秒更新同样是文本直写。
      </p>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* 6. props 桥与 setup 只跑一次                                        */
/* ------------------------------------------------------------------ */

const PropsBridgeDemo = defineComponent<{ label: string }>((props) => {
  // 非响应式局部变量：thunk 闭包捕获，setup 只跑一次的证物。
  const setupAt = new Date().toLocaleTimeString();
  const mountedAt = ref("");
  onMounted(() => {
    mountedAt.value = new Date().toLocaleTimeString();
  });
  return (
    <div className="demo-box">
      <span className="badge">props 桥</span>
      <p>props.label: {props.label}</p>
      <p>setup 执行于 {setupAt}（不变 = setup 只跑一次）</p>
      <p>onMounted 触发于 {mountedAt.value}</p>
      <p className="hint">
        在上方输入：React 宿主重渲染 → commit 后 syncProps 写入 reactive props →
        依赖 props 的块自动更新。
      </p>
    </div>
  );
});

/** 独立小节组件：输入框的 state 只让本节重渲染，不干扰上方各 demo 的计数。 */
function PropsSection(): React.ReactElement {
  const [label, setLabel] = useState("你好 reactivue");
  return (
    <section className="panel">
      <h2>6. props 桥与 setup 只跑一次</h2>
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="输入会触发 React 宿主重渲染"
      />
      <PropsBridgeDemo label={label} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 页面骨架                                                            */
/* ------------------------------------------------------------------ */

const COMPILED_SHAPE = `// 源码
const Counter = defineComponent(() => <p>count: {count.value}</p>);

// 编译产物（@uno-pc/reactivue 的 Vite / Rsbuild 插件）
const Counter = _createCompiledHost(() => ({ render: () => (
  <p>
    count: <_TextBinding value={() => count.value} />
  </p>
) }));`;

export default function App(): React.ReactElement {
  return (
    <main className="content">
      <h1>@uno-pc/reactivue 按 API 对比示例</h1>
      <p className="intro">
        每节演示一个 API，并给出「普通 React 写法 vs reactivue
        写法」或「两条更新通道」的 对照。页面注入了 react-scan：React
        重渲染的组件会闪高亮，文本直写的块不会 —— 这是观察对比效果最直接的方式。
      </p>

      <section className="panel">
        <h2>0. 编译期做了什么</h2>
        <pre className="code">{COMPILED_SHAPE}</pre>
        <p className="hint">
          转换发生在构建期：业务源码保持 Vue
          风格，产物里的块组件承担订阅与定向更新。
        </p>
      </section>

      <section className="panel">
        <h2>1. 文本通道：TextBinding vs React setState</h2>
        <div className="compare-grid">
          <NaiveCounter />
          <HostRenderMeter>
            <FineCounter />
          </HostRenderMeter>
        </div>
      </section>

      <section className="panel">
        <h2>2. computed：依赖缓存</h2>
        <ComputedDemo />
      </section>

      <section className="panel">
        <h2>3. 结构通道：Block</h2>
        <ListDemo />
      </section>

      <section className="panel">
        <h2>4. v-memo：额外触发源</h2>
        <MemoDemo />
      </section>

      <section className="panel">
        <h2>5. VueUse 组合式函数（compat 桥）</h2>
        <VueUseDemo />
      </section>

      <PropsSection />
    </main>
  );
}
