import "./index.css";

const rootEl = document.querySelector("#root");
if (rootEl) {
  rootEl.innerHTML = `
    <main class="content">
      <h1>样式分层示例</h1>
      <p>打开 DevTools 查看 .box 的 @layer 归属与最终样式。</p>
      <div class="box">同一选择器，分别来自 vendor 层与 application 层</div>
    </main>
  `;
}
