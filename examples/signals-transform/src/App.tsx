import { signal, computed } from "@preact/signals-react";
import "./App.css";

const count = signal(0);
const double = computed(() => count.value * 2);
let appRender = 0;
export default function App() {
  appRender++;
  return (
    <main
      className="content"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        border: "1px solid green",
      }}
    >
      <div>
        <h1>Signals 编译期转换示例</h1>
        <div className="toolbar">
          <button
            onClick={() => {
              count.value += 1;
            }}
          >
            +1
          </button>
          <button
            onClick={() => {
              count.value = 0;
            }}
          >
            重置
          </button>
        </div>
        <p>父组件渲染次数：{appRender}</p>
      </div>
      <TextRenderNode />
      <TextNoRenderNode />
    </main>
  );
}
// 组件级重渲染
let textRenderNodeRender = 0;
const TextRenderNode = () => {
  textRenderNodeRender++;
  return (
    <div style={{ border: "1px solid red", padding: 10 }}>
      <div>预期：当前组件自身整体进行渲染-不影响其他组件渲染</div>
      <div>组件渲染次数：{textRenderNodeRender}</div>
      <div>原值：{count.value}</div>
      <div>计算值：{double.value}</div>
    </div>
  );
};

// 文本节点优化-不造成组件重渲染
let textNoRenderNodeRender = 0;
const TextNoRenderNode = () => {
  textNoRenderNodeRender++;
  return (
    <div style={{ border: "1px solid blue", padding: 10 }}>
      <div>
        预期：当前组件文本节点自行渲染-所处组件不进行渲染-不影响其他组件渲染
      </div>
      <div>文本节点优化组件渲染次数：{textNoRenderNodeRender}</div>
      <div>原值：{count}</div>
      <div>计算值：{double}</div>
    </div>
  );
};
