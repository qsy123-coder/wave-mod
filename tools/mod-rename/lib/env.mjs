/**
 * 极简 .env 读取。
 *
 * 不引 `dotenv`：它在本项目里只是 opennext / shadcn 的传递依赖，
 * 直接 import 属于「用了没声明的库」，升级一层就可能消失（CLAUDE.md 的依赖规则）。
 * 只需要 `KEY=VALUE` 这一种写法，十几行足够。
 */
import { existsSync, readFileSync } from "node:fs";

export function loadEnvFiles(paths, env = process.env) {
  for (const p of paths) {
    if (!p || !existsSync(p)) continue;
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line || /^\s*#/.test(line)) continue;
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const [, key, rest] = m;
      if (env[key] !== undefined && env[key] !== "") continue; // 真实环境变量优先
      let value = rest.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      } else {
        // 行尾注释：`KEY=value # 说明`
        const hash = value.search(/\s#/);
        if (hash >= 0) value = value.slice(0, hash).trim();
      }
      env[key] = value;
    }
  }
  return env;
}
