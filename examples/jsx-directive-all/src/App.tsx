import { useState } from "react";
import "./App.css";

type ViewState = "ready" | "loading" | "idle";

export default function App() {
  const [state, setState] = useState<ViewState>("idle");
  const [visible, setVisible] = useState(true);

  return (
    <main className="content">
      <h1>JSX 指令示例</h1>

      <div className="toolbar">
        <button onClick={() => setState("ready")}>ready</button>
        <button onClick={() => setState("loading")}>loading</button>
        <button onClick={() => setState("idle")}>idle</button>
        <button onClick={() => setVisible((value) => !value)}>
          切换 v-show
        </button>
      </div>

      {/* 条件链分支之间允许存在换行与缩进（兼容 Prettier 等代码格式化），
          仅非空白文本、逗号或其他节点会中断链条。 */}
      <section className="panel">
        <p v-if={state === "ready"}>已就绪</p>
        <p v-else-if={state === "loading"}>加载中</p>
        <p v-else>暂不可用</p>
      </section>

      <section className="panel">
        <div v-show={visible}>v-show 保留元素，只切换 display</div>
        <div style={{ color: "#8ab4f8" }} v-show={visible}>
          已有 style 表达式会先展开，再合并 v-show 的属性
        </div>
      </section>
    </main>
  );
}
