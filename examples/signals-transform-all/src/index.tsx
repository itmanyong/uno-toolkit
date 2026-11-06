import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const rootEl = document.getElementById("root");
const benchMode = new URLSearchParams(globalThis.location?.search ?? "").has(
  "bench",
);

if (benchMode && rootEl) {
  const install = async () => {
    const bench = await import("./bench/bench");
    const BenchApp = bench.BenchApp;
    const root = createRoot(rootEl);
    root.render(<BenchApp />);
    bench.installBench();
  };
  install();
} else if (rootEl) {
  const root = createRoot(rootEl);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
