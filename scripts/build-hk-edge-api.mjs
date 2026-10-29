#!/usr/bin/env node
/**
 * 把 `deploy/hk-edge-api/server.ts` 打成**单文件**，供香港机直接跑：
 *
 *   node scripts/build-hk-edge-api.mjs            # 产出 deploy/hk-edge-api/dist/server.mjs
 *
 * 为什么不直接 rsync 整个仓库过去再跑 tsx：那台机器只有 2C2G，
 * 且它跑的是 nginx + 计数服务，不该再躺一份 node_modules 和 TS 工具链。
 * 打成一个 .mjs（约一两百 KB）运维面最小：换版本就是覆盖一个文件。
 *
 * 两处刻意的处理：
 *   - `server-only` 换成空实现（那个包在非 RSC 环境会直接抛错，见 stub 里的说明）
 *   - 基线 JSON 不进包：它是数据不是代码，由部署脚本单独拷到 /opt 下，
 *     路径走 ENGAGEMENT_BASELINE_PATH，重导基线时不用重新打包
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [join(root, "deploy/hk-edge-api/server.ts")],
  outfile: join(root, "deploy/hk-edge-api/dist/server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // 代码里用的是 `@/lib/...`，与 Next 同一条路径别名
  tsconfig: join(root, "tsconfig.json"),
  alias: {
    "server-only": join(root, "deploy/hk-edge-api/server-only-stub.js"),
  },
  legalComments: "none",
  logLevel: "info",
  metafile: true,
}).then((result) => {
  const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
  console.log(`\n✅ deploy/hk-edge-api/dist/server.mjs  ${(bytes / 1024).toFixed(0)} KB`);
});
