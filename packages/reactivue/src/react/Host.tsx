import * as React from "react";
import { useContext, useEffect, useLayoutEffect, useRef } from "react";
import type { FC } from "react";
import {
  createHostInstance,
  syncProps,
} from "../core/setup";
import type { HostInstance, Setup } from "../core/setup";
import { disposeInstance, runHooks } from "../core/scope";
import { Block } from "./Block";
import { InstanceContext } from "./context";

export interface DefineComponentOptions<P extends object> {
  displayName?: string;
  /** 预留：宿主级额外 deps，首版由 v-memo / MemoBlock 承担。 */
  memoDeps?: (props: P) => unknown[];
}

/** setup 只跑一次 + props 桥 + 生命周期；编译产物与普通入口共用。 */
export function useHostInstance<P extends object>(
  setup: Setup<P>,
  reactProps: P,
): HostInstance<P> {
  // 父组件渲染时经 InstanceContext 提供其宿主实例；挂载惰性初始化只跑一次，
  // 静态组件树下此处读到的即为父实例，据此接通 provide/inject 的 parent 链。
  const parentInstance = useContext(InstanceContext);
  const ref = useRef<HostInstance<P> | null>(null);
  if (ref.current === null) {
    ref.current = createHostInstance(reactProps, setup, parentInstance);
  }
  const host = ref.current;

  // §7.3 修订：commit 后、paint 前同步 props，避免在 render 阶段触发同步 trigger。
  useLayoutEffect(() => {
    syncProps(host.instance, reactProps);
  });

  useEffect(() => {
    const instance = host.instance;
    instance.mounted = true;
    runHooks(instance, "beforeMount");
    runHooks(instance, "mounted");
    return () => {
      instance.mounted = false;
      runHooks(instance, "beforeUnmount");
      // StrictMode 的 mount→unmount→mount 在同一同步栈内，微任务里复查可避免误 stop。
      queueMicrotask(() => {
        if (!instance.mounted && !instance.disposed) disposeInstance(instance);
      });
    };
  }, [host]);

  return host;
}

/**
 * 无插件降级路径：整体用一个 Block 订阅 render thunk 的依赖，
 * 更新粒度退化为组件级，但 setup 仍只执行一次、功能正确。
 */
export function defineComponent<P extends object = Record<string, unknown>>(
  setup: Setup<P>,
  options: DefineComponentOptions<P> = {},
): FC<P> {
  const Component: FC<P> = (reactProps) => {
    const host = useHostInstance(setup, reactProps);
    return (
      <InstanceContext.Provider value={host.instance}>
        <Block render={host.render} />
      </InstanceContext.Provider>
    );
  };
  Component.displayName = options.displayName ?? "ReactivueComponent";
  return Component;
}

/** 编译产物入口：render 内部已由插件切成块，不再整体订阅。 */
export function createCompiledHost<P extends object>(
  setup: Setup<P>,
  options: DefineComponentOptions<P> = {},
): FC<P> {
  const Component: FC<P> = (reactProps) => {
    const host = useHostInstance(setup, reactProps);
    // 编译产物的 v-memo deps 在宿主 render 层求值，必须读到本次 render 的 props。
    // §15.3 后所有 effect 均带 scheduler，trigger 只入微任务事务，不会在 render 阶段写 DOM；
    // syncProps 幂等且用 pauseTracking 包裹写入，React 重启 render 无副作用。
    syncProps(host.instance, reactProps);
    return (
      <InstanceContext.Provider value={host.instance}>
        <>{host.render()}</>
      </InstanceContext.Provider>
    );
  };
  Component.displayName = options.displayName ?? "ReactivueComponent";
  return Component;
}
