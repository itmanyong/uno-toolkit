import "./vendor.css";
import "./index.css";

const rootEl = document.querySelector("#root");
if (rootEl) {
  rootEl.innerHTML = `
    <main class="content">
      <h1>样式重写示例</h1>
      <p>打开 DevTools 观察以下三处样式已被构建期改写。</p>
      <div class="card">
        <strong>.card</strong>：padding 由 vendor.css 的 8px 12px 换成 24px，且只保留一条。
      </div>
      <p>
        <button class="btn" type="button">.btn：整个声明块被 rewrite 覆盖</button>
      </p>
      <p class="notice">
        .notice：颜色值按文本替换为 #fdd663，左侧边框按正则加宽到 6px。
      </p>
    </main>
  `;
}