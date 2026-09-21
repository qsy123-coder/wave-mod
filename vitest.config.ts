import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // scripts/ 下的纯逻辑（备份链路的判定）也纳入测试：那条链路出错时只留下
    // "一份合法但过期的文件 + 退出码 0"，不测就没有任何信号。
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.mjs"],
    restoreMocks: true,
  },
});
