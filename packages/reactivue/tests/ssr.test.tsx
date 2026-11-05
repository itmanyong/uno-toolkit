import { expect, test } from "rstack/test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { ref } from "@vue/reactivity";
import { computed } from "@vue/reactivity";
import { TextBinding } from "../src/react/TextBinding";
import { defineComponent } from "../src/react/Host";

/**
 * SSR 输出形态验证（renderToString）：
 * - 文本通道输出 initial 文本 + 隐藏锚点（客户端 hydration 后接管直写）；
 * - defineComponent 的 SSR markup 与首屏值一致；
 * - 服务端不执行 effect，输出不依赖任何订阅。
 */
test("TextBinding 的 SSR 输出为 initial 文本 + 隐藏锚点", () => {
  const count = ref(7);
  const html = renderToString(
    <p>
      <TextBinding value={() => count.value} />
    </p>,
  );
  expect(html).toContain("7");
  expect(html).toContain('data-rv-anchor=""');
  expect(html).toContain("hidden");
});

test("defineComponent 的 SSR 输出与首屏值一致", () => {
  const Demo = defineComponent<{ base: number }>((props) => {
    const count = ref(props.base);
    const doubled = computed(() => count.value * 2);
    return () => (
      <main>
        <h1>{count.value}</h1>
        <p>{doubled.value}</p>
        <TextBinding value={() => count.value} />
      </main>
    );
  });
  const html = renderToString(<Demo base={21} />);
  // props 初始值直接进入 reactive props（createHostInstance），SSR 首屏即正确
  expect(html).toContain("<h1>21</h1>");
  expect(html).toContain("<p>42</p>");
  expect(html).toContain("21");
  expect(html).toContain('data-rv-anchor=""');
});

test("SSR 流水线可渲染嵌套结构（块组件在服务端为静态标记）", () => {
  const items = ref<string[]>(["a", "b"]);
  const List = defineComponent(() => {
    return () => (
      <ul>
        {items.value.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  });
  const html = renderToString(<List />);
  expect(html).toContain("<li>a</li>");
  expect(html).toContain("<li>b</li>");
});
