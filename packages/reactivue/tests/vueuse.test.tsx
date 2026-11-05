import { expect, test } from "rstack/test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useNow, useToggle } from "@vueuse/core";
import { defineComponent } from "../src/react/Host";
import { ref } from "../src/index";

// VueUse 内部 `import { ... } from "vue"` 经 rstack.config.ts 的 alias 指向 ./src/compat。
// 本文件验证目标：纯组合式函数库在 React + compat 桥下真实可用（决议 G4）。

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function mount(element: React.ReactNode): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

function cleanup(root: Root, container: HTMLDivElement): void {
  act(() => root.unmount());
  container.remove();
}

const ToggleDemo = defineComponent(() => {
  const [enabled, toggle] = useToggle(false);
  return {
    render: () => (
      <div>
        <span>{enabled.value ? "ON" : "OFF"}</span>
        <button onClick={() => toggle()}>flip</button>
      </div>
    ),
  };
});

test("VueUse useToggle 在 defineComponent 内工作", async () => {
  const { container, root } = mount(<ToggleDemo />);
  expect(container.querySelector("span")?.textContent).toBe("OFF");
  const button = container.querySelector("button");
  // trigger 只入微任务事务（§统一事务调度）：同步 act 不会冲刷业务微任务，
  // 必须 await 让调度器把 bump 交付给 useSyncExternalStore。
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(container.querySelector("span")?.textContent).toBe("ON");
  cleanup(root, container);
});

const NowDemo = defineComponent(() => {
  // VueUse 15 移除了 interval 选项（改由 scheduler 自定义），默认调度即可。
  const now = useNow();
  const label = ref("static");
  return {
    render: () => (
      <p>
        {String(now.value.getFullYear() > 2020)}
        {label.value}
      </p>
    ),
  };
});

test("VueUse useNow 经 compat watch 桥工作", () => {
  const { container, root } = mount(<NowDemo />);
  expect(container.textContent).toContain("true");
  expect(container.textContent).toContain("static");
  cleanup(root, container);
});
