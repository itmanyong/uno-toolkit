import { expect, test } from "rstack/test";
import { effect, ref } from "@vue/reactivity";
import {
  createHostInstance,
  getSetupCallCount,
  resetSetupCallCount,
  syncProps,
} from "../src/core/setup";
import { disposeInstance, runHooks } from "../src/core/scope";
import { onMounted, onUnmounted } from "../src/react/lifecycle";
import { toText } from "../src/shared/to-text";

test("toText 与 React 文本渲染语义一致", () => {
  expect(toText("a")).toBe("a");
  expect(toText(12)).toBe("12");
  expect(toText(12n)).toBe("12");
  expect(toText(null)).toBe("");
  expect(toText(undefined)).toBe("");
  expect(toText(true)).toBe("");
});

test("setup 只执行一次，props 桥同步新值与新增键", () => {
  resetSetupCallCount();
  const host = createHostInstance<Record<string, unknown>>(
    { label: "a" },
    (props) => () => String(props.label),
  );
  expect(getSetupCallCount()).toBe(1);
  expect(host.render()).toBe("a");

  syncProps(host.instance, { label: "b", extra: 1 });
  expect(host.render()).toBe("b");
  expect(getSetupCallCount()).toBe(1);

  syncProps(host.instance, { label: "b" });
  expect("extra" in host.instance.props).toBe(false);
  disposeInstance(host.instance);
});

test("生命周期钩子注册在实例作用域内并可按名触发", () => {
  const calls: string[] = [];
  const host = createHostInstance<Record<string, never>>({}, () => {
    onMounted(() => calls.push("mounted"));
    onUnmounted(() => calls.push("unmounted"));
    return () => null;
  });
  runHooks(host.instance, "mounted");
  disposeInstance(host.instance);
  expect(calls).toEqual(["mounted", "unmounted"]);
  expect(host.instance.disposed).toBe(true);
});

test("disposeInstance 停止 scope 内的 effect", () => {
  const count = ref(0);
  let runs = 0;
  const host = createHostInstance<Record<string, never>>({}, () => {
    effect(() => {
      void count.value;
      runs += 1;
    });
    return () => null;
  });
  expect(runs).toBe(1);
  disposeInstance(host.instance);
  count.value = 5;
  expect(runs).toBe(1);
});

test("setup 之外的生命周期调用被安全忽略", () => {
  expect(() => onMounted(() => undefined)).not.toThrow();
});
