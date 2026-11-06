/* @uno-pc 三方案横评共享测量驱动（framework-agnostic）。
 *
 * 本文件在 preact-signals / react-compiler 两套 fixture 中保持
 * 字节级一致，以保证取数口径公平。测量完全基于 DOM 观测 + performance.now，
 * 不依赖任何框架内部 API：
 *   - DOM 写次数：MutationObserver 记录数（characterData / attributes / childList）
 *   - 批量写 e2e：performance.now() 墙钟，写循环后等 2 个 rAF 视为「落地」
 *   - 单写延迟：每轮一次写入 + 2*rAF 落地，采多轮报 mean / p50 / p95 / max
 */

export interface Scenario {
  key: string;
  setup: () => void; // 复位为基线，避免值级抑制串扰
  write: (value: number) => void; // text/computed/attr 写第 value 次；list 为追加一项
  final: () => string; // 读取最终 DOM 值用于断言正确性
  isList?: boolean;
}

interface Quantiles {
  mean: number;
  p50: number;
  p95: number;
  max: number;
  min: number;
}

interface BatchResult {
  scenario: string;
  syncMs: number;
  e2eMs: number;
  moRecords: number;
  final: string;
}

interface SteadyResult {
  scenario: string;
  meta: Quantiles;
  domWrites: number;
  final: string;
}

export function makeDriver(scenarios: Scenario[]) {
  let observer: MutationObserver | null = null;
  let records = 0;
  let sessions = 0;

  const resetObserver = (): void => {
    if (observer !== null) observer.disconnect();
    records = 0;
    sessions = 0;
    observer = new MutationObserver((list) => {
      records += list.length;
      sessions += 1;
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  };

  // 落地判定：两跳宏任务退让（MessageChannel 无 setTimeout 的 4ms 钳制）。
  // 一跳 flush 微任务（文本/信号经微任务提交），二跳覆盖 React 结构更新。
  // 不依赖 rAF，避免 headless 下绘制帧节流导致永久挂起。
  const tick = (): Promise<void> =>
    new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => resolve();
      ch.port2.postMessage(null);
    });
  const settle = async (): Promise<void> => {
    await tick();
    await tick();
  };

  const quantile = (sorted: number[], q: number): number => {
    if (sorted.length === 0) return 0;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + (sorted[base + 1] - sorted[base]) * rest;
    }
    return sorted[base];
  };

  const summarize = (values: number[]): Quantiles => {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return {
      mean,
      p50: quantile(sorted, 0.5),
      p95: quantile(sorted, 0.95),
      max: sorted[sorted.length - 1] ?? 0,
      min: sorted[0] ?? 0,
    };
  };

  /** 批量写：同 task 连续 N 次写入，看合并去重与端到端落地。 */
  const runBatch = async (
    scenario: Scenario,
    count: number,
  ): Promise<BatchResult> => {
    scenario.setup();
    resetObserver();
    // 预热
    for (let i = 0; i < 8; i += 1) scenario.write(i + 1);
    await settle();
    resetObserver();
    const t0 = performance.now();
    for (let i = 0; i < count; i += 1) scenario.write(i + 1);
    const t1 = performance.now();
    await settle();
    const t2 = performance.now();
    if (observer !== null) observer.disconnect();
    return {
      scenario: scenario.key,
      syncMs: t1 - t0,
      e2eMs: t2 - t0,
      moRecords: records,
      final: scenario.final(),
    };
  };

  /** 单写延迟：每轮一次写入，记录落地墙钟。计数器累加避免值级抑制。 */
  const runSteady = async (
    scenario: Scenario,
    count: number,
    base: number,
  ): Promise<SteadyResult> => {
    scenario.setup();
    resetObserver();
    for (let i = 0; i < 8; i += 1) scenario.write(i + 1);
    await settle();
    resetObserver();
    const values: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const t0 = performance.now();
      scenario.write(base + i + 1);
      await settle();
      const t1 = performance.now();
      values.push(t1 - t0);
    }
    if (observer !== null) observer.disconnect();
    return {
      scenario: scenario.key,
      meta: summarize(values),
      domWrites: records,
      final: scenario.final(),
    };
  };

  const runAll = async (
    batchCount: number,
    steadyCount: number,
    base = 100000,
  ): Promise<{
    framework: string;
    batches: BatchResult[];
    steady: SteadyResult[];
  }> => {
    const framework = (globalThis as any).__FRAMEWORK ?? "unknown";
    const batches: BatchResult[] = [];
    const steady: SteadyResult[] = [];
    for (const scenario of scenarios) {
      batches.push(await runBatch(scenario, batchCount));
      steady.push(await runSteady(scenario, steadyCount, base));
    }
    const result = { framework, batches, steady };
    (globalThis as any).__benchResult = result;
    return result;
  };

  return { runAll };
}
