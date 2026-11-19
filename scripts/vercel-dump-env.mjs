#!/usr/bin/env node
/**
 * 把 Vercel 项目里 **production** 环境变量的明文导到本地，供迁移到别的账号 / 香港机自托管使用。
 *
 * 为什么需要单独一个脚本：
 *  - `GET /v9/projects/{id}/env?decrypt=true` 对 encrypted 类型**不解密**，返回的是
 *    `eyJ2IjoidjIi...` 这种信封串（实测 2026-11-19）；只有
 *    `GET /v1/projects/{id}/env/{envId}?decrypt=true` 单条读才返回明文。
 *  - 所以要「先列表拿 id，再逐条解密」。
 *
 * 用法：
 *   set -a && . "C:/Users/WINDOWS11/.wavemod-secrets/vercel.env" && set +a
 *   NODE_USE_ENV_PROXY=1 node scripts/vercel-dump-env.mjs
 *   NODE_USE_ENV_PROXY=1 node scripts/vercel-dump-env.mjs --out="C:/Users/WINDOWS11/.wavemod-secrets/wavemod.env.production"
 *
 * 产物（默认写到 .wavemod-secrets，落在仓库外，不会被 git 带上）：
 *   wavemod.env.production   KEY="value" 形式，`next start` 的 @next/env 与 dotenv 都能读
 *   wavemod.env.payload.json 迁移脚本用的 {key,value,type,target} 数组
 *
 * 只读：不发任何写请求，不改远端状态。
 */

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.vercel.com';
const TEAM = process.env.VERCEL_TEAM_ID || 'team_vVEiSd01t8RrQ4qcgO21innr';
const PROJECT = process.env.VERCEL_PROJECT_ID || 'prj_W9fgQ4IkezyshouTUgzp1BGhjwD9';
const TOKEN = process.env.VERCEL_TOKEN;
const OUT_DIR = 'C:/Users/WINDOWS11/.wavemod-secrets';

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

if (!TOKEN) {
  console.error('[x] 缺 VERCEL_TOKEN，先 source .wavemod-secrets/vercel.env');
  process.exit(1);
}

const outEnv = argValue('out') || path.join(OUT_DIR, 'wavemod.env.production');
const outJson = argValue('json') || path.join(OUT_DIR, 'wavemod.env.payload.json');

async function api(pathname) {
  const res = await fetch(`${API}${pathname}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${pathname} :: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** .env 值转义：换行写成 \n，反斜杠与双引号转义，整体用双引号包住最稳 */
function quote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

const list = await api(`/v9/projects/${PROJECT}/env?teamId=${TEAM}`);
const envs = list?.envs ?? [];
const picked = new Map();

for (const meta of envs) {
  if (!(meta.target || []).includes('production')) continue;
  // 同一个 key 可能有 production / preview 两条（或同一条挂两个 target），只取 production 的一份
  if (picked.has(meta.key)) continue;

  const one = await api(`/v1/projects/${PROJECT}/env/${meta.id}?teamId=${TEAM}&decrypt=true`);
  if (!one?.decrypted || typeof one.value !== 'string') {
    console.warn(`[!] ${meta.key} 未解密（decrypted=${one?.decrypted}），跳过`);
    continue;
  }
  if (one.value === '') {
    console.warn(`[!] ${meta.key} 明文为空，跳过`);
    continue;
  }
  picked.set(meta.key, {
    key: meta.key,
    value: one.value,
    type: meta.type || 'encrypted',
    target: meta.target || ['production'],
  });
}

const rows = [...picked.values()].sort((a, b) => a.key.localeCompare(b.key));
fs.mkdirSync(path.dirname(outEnv), { recursive: true });
fs.writeFileSync(outEnv, rows.map((r) => `${r.key}=${quote(r.value)}`).join('\n') + '\n', 'utf8');
fs.writeFileSync(outJson, JSON.stringify(rows, null, 2), 'utf8');

console.log(`[+] ${rows.length} 个 production 变量`);
console.log(`    env      -> ${outEnv}`);
console.log(`    payload  -> ${outJson}`);
console.log('[i] 只打印 key，不打印 value：');
console.log('    ' + rows.map((r) => r.key).join(' '));
