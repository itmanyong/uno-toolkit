import { createRoot } from "react-dom/client";

const rootEl = document.getElementById("root");
const install = async () => {
  const bench = await import("./bench/bench.compiled");
  const BenchApp = bench.BenchApp;
  if (rootEl) {
    createRoot(rootEl).render(<BenchApp />);
    bench.installBench();
  }
};
install();
