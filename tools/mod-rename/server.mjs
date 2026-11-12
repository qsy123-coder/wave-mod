/**
 * Mod 命名工坊 —— 本地网页工具（P0：扫描 / 词表建议 / 分类校验 / 改名 / 撤销）。
 *
 * 为什么是独立进程而不是 Next 路由：它要直接 rename 本机 F: 盘上的文件。
 * 放进 Next 就意味着一份「能改服务器文件」的接口会跟着部署到 Vercel，
 * 只能靠环境变量硬关 —— 风险面太大。这里只绑 127.0.0.1，且不提供任何删除接口。
 *
 * 用法：
 *   npm run rename-ui            # http://127.0.0.1:4318/?t=<一次性 token>
 *   node tools/mod-rename/server.mjs --port=4318
 */
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCharacterAndTitle } from "../../scripts/daily-classify.mjs";
import { buildModGroupsFileContent, modGroupsPath, readModGroupsFile } from "../../scripts/mod-groups.mjs";
import { normalizeGameBananaUrl } from "../../scripts/mod-groups-pure.mjs";

import { aiConfig, needsAi, suggestWithModel } from "./lib/ai.mjs";
import { loadEnvFiles } from "./lib/env.mjs";
import { loadKnownMods } from "./lib/db.mjs";
import { injectToken } from "./lib/html.mjs";
import { applyPlan, listJournals, undoJournal } from "./lib/journal.mjs";
import { HANGUL_RE, looksLikeEndfield, splitExistingName, translate } from "./lib/naming.mjs";
import { markBatchConflicts, planAll, summarize } from "./lib/plan.mjs";
import { dateDirToDay, listDateDirs, ROOT_SOURCE, scanDateDir } from "./lib/scan.mjs";
import { inspectZip, siblingsOf, splitZip } from "./lib/split.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const PUBLIC_DIR = join(HERE, "public");
const JOURNAL_DIR = join(HERE, ".journal");
const GLOSSARY_PATH = join(HERE, "data", "glossary.json");

loadEnvFiles([join(REPO, ".env.local"), join(REPO, ".env")]);

const BASE =
  process.env.WAVE_MOD_DAILY_BASE?.trim() ||
  String.raw`F:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新`;
// 爬虫仓库 2026-11-12 已并入本仓库；优先用新位置的 tools/wuwa_mod_crawl，
// 旧布局（数据目录旁边的 wuwa_mod_crawl）留作兜底，方便旧的本地配置继续用。
const CRAWL_DIR =
  process.env.WAVE_MOD_CRAWL_DIR?.trim() ||
  (existsSync(resolve(REPO, "tools", "wuwa_mod_crawl"))
    ? resolve(REPO, "tools", "wuwa_mod_crawl")
    : resolve(BASE, "..", "wuwa_mod_crawl"));
const SUMMARY_DIR = join(BASE, "_Mod每日汇总");

const argPort = process.argv.slice(2).find((a) => a.startsWith("--port="));
const PORT = Number(argPort ? argPort.slice("--port=".length) : process.env.RENAME_UI_PORT || 4318);
const HOST = "127.0.0.1";
const TOKEN = randomUUID();
/** `--open`：启动后自己把浏览器打开（桌面快捷方式用），省得再复制 URL */
const OPEN_BROWSER = process.argv.includes("--open");

const glossary = JSON.parse(readFileSync(GLOSSARY_PATH, "utf8"));

// ---------------- 安全 ----------------

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // curl / 本机脚本
  return origin === `http://${HOST}:${PORT}` || origin === `http://localhost:${PORT}`;
}

function tokenOk(req, url) {
  return req.headers["x-rename-token"] === TOKEN || url.searchParams.get("t") === TOKEN;
}

/** 只认 BASE 下的 `W-YYYY.M.D` 目录，挡掉 `..`、盘符切换、符号链接 */
function safeDateDir(name) {
  if (!dateDirToDay(name)) throw new Error(`不是日期目录：${name}`);
  const p = resolve(BASE, name);
  if (!p.startsWith(BASE + sep)) throw new Error("路径越界");
  if (!existsSync(p) || !statSync(p).isDirectory()) throw new Error(`目录不存在：${name}`);
  return p;
}

/** 来源子目录白名单：P0 只认这两个，别的名字一律拒绝 */
const SOURCES = ["arca.live", "GameBanana"];

function safeSourceDir(dateDir, source) {
  if (source === ROOT_SOURCE) return dateDir; // 日期目录顶层：整理/搬上去的包
  if (!SOURCES.includes(source)) throw new Error(`未知来源：${source}`);
  const p = resolve(dateDir, source);
  if (!p.startsWith(resolve(dateDir) + sep)) throw new Error("路径越界");
  if (!existsSync(p) || !statSync(p).isDirectory()) throw new Error(`来源目录不存在：${source}`);
  return p;
}

/** 只接受来源目录下的单个文件名（不含路径分隔符） */
function safeEntryPath(sourceDir, name) {
  const b = String(name ?? "");
  if (!b || b !== basename(b) || b.includes("..")) throw new Error(`非法文件名：${name}`);
  const p = resolve(sourceDir, b);
  if (!p.startsWith(resolve(sourceDir) + sep)) throw new Error("路径越界");
  if (!existsSync(p) || !statSync(p).isFile()) throw new Error(`文件不存在：${b}`);
  return p;
}

/**
 * 校验页面提交的分组元数据，再交给 `mergeModGroups` 合并。
 *
 * 页面是本地可信的，但请求体仍然按外部输入处理：只认 GameBanana 帖子 URL，
 * 组数/变体数/标签长度都设上限，避免一个坏请求把 `.mod-groups.json` 写成巨型对象。
 */
function normalizeIncomingPostGroups(raw) {
  if (!Array.isArray(raw)) return [];
  const groups = [];
  for (const group of raw.slice(0, 200)) {
    const postUrl = normalizeGameBananaUrl(group?.postUrl);
    if (!postUrl) continue;
    const variants = [];
    const seen = new Set();
    for (const variant of (Array.isArray(group?.variants) ? group.variants : []).slice(0, 30)) {
      const label = String(variant?.label ?? "").trim();
      const name = String(variant?.name ?? "").trim();
      if (!label || label.length > 60 || /[\r\n]/.test(label)) continue;
      if (!name || name.length > 300 || /[\r\n]/.test(name)) continue;
      const identity = `${String(variant?.sourceName ?? "").trim()}|${String(variant?.localName ?? "").trim()}|${name}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      variants.push({
        label,
        name,
        localName: String(variant?.localName ?? "").trim().slice(0, 300),
        sourceName: String(variant?.sourceName ?? "").trim().slice(0, 300),
        isBase: Boolean(variant?.isBase),
      });
    }
    if (variants.length >= 2) groups.push({ postUrl, variants });
  }
  return groups;
}

// ---------------- 业务 ----------------

/**
 * 建议名：已经是站内规范名的直接拆回来（方便微调），否则走词表。
 * 「已是规范名」的判定也用项目自己的 resolveCharacterAndTitle，避免两套规则。
 */
function suggestFor(items, knownCharacters) {
  const out = {};
  for (const item of items) {
    const parsed = resolveCharacterAndTitle(item.base);
    const named =
      knownCharacters?.has(parsed.character) && item.base.startsWith(`${parsed.character}-`);
    const s = named
      ? splitExistingName(item.base, parsed.character)
      : translate(item.base, glossary, {
          author: item.meta?.author,
          subcategory: item.meta?.subcategory,
        });
    // 「已经是规范名」不等于「名字已经能看」：`心月狐-의 별자리` 角色认出来了，
    // 名称里还留着韩文，这种也要标低置信度，好让 AI 补全有活干。
    const hangulLeft = HANGUL_RE.test(s.name ?? "");
    const merged = { ...s, confidence: hangulLeft ? "low" : s.confidence };
    out[item.name] = {
      ...merged,
      // 「要不要 AI」由服务端算（含纯英文名的情况），页面只读这个字段，避免两边规则漂移
      needsAi: needsAi(merged),
      alreadyNamed: named,
      endfield:
        looksLikeEndfield(item.name, glossary) || looksLikeEndfield(item.meta?.subcategory ?? "", glossary),
    };
  }
  return out;
}

async function planRows(dateDir, rows) {
  const scan = scanDateDir(dateDir, { crawlDir: CRAWL_DIR, summaryDir: SUMMARY_DIR });
  const { knownCharacters, existingDedup, error } = await loadKnownMods();
  const byKey = new Map(rows.map((r) => [`${r.source}|${r.from}`, r]));

  const results = scan.sources.map((source) => {
    const suggestions = {};
    for (const item of source.items) {
      const r = byKey.get(`${source.name}|${item.name}`);
      suggestions[item.name] = r
        ? {
            characters: r.characters ?? [],
            name: r.name ?? "",
            hotkeys: r.hotkeys ?? "",
            author: r.author ?? "",
            confidence: r.confidence ?? "high",
            leftover: r.leftover ?? [],
          }
        : { characters: [], name: "", hotkeys: "", author: "", confidence: "low", leftover: [] };
    }
    return {
      source: source.name,
      ...planAll({ items: source.items, suggestions, knownCharacters, existingDedup, glossary }),
    };
  });
  // 一次应用可以横跨 arca.live / GameBanana：同一目标名要在两个来源之间也查一遍，
  // 否则页面照样会把两条都勾上，提交时才在 applyPlan 撞车。
  markBatchConflicts(results.flatMap((r) => r.rows));
  for (const r of results) r.stats = summarize(r.rows);
  return { knownError: error, sources: results };
}

// ---------------- HTTP ----------------

function send(res, status, body, headers = {}) {
  // Buffer 不能被 JSON.stringify：静态文件会变成 {"type":"Buffer","data":[…]} 糊到浏览器里
  const isBinary = Buffer.isBuffer(body) || body instanceof Uint8Array;
  const isJson = !isBinary && typeof body !== "string";
  res.writeHead(status, {
    "content-type": isBinary
      ? headers["content-type"] ?? "application/octet-stream"
      : isJson
        ? "application/json; charset=utf-8"
        : "text/plain; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("请求体太大");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  // 浏览器自动请求的 favicon：没 token 也要给个空响应，不然控制台永远挂着一条 403
  if (url.pathname === "/favicon.ico") return send(res, 204, "");

  if (!sameOrigin(req)) return send(res, 403, "forbidden origin");
  if (!tokenOk(req, url)) return send(res, 403, "forbidden token");

  try {
    if (req.method === "GET" && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname];
      const body = readFileSync(join(PUBLIC_DIR, file));
      // 子资源（style.css / app.js）也必须带 token，否则会被鉴权挡成 403
      // —— 页面之前就是这么白屏的：HTML 出来了，JS/CSS 全 403。
      if (url.pathname === "/") {
        return send(res, 200, injectToken(body.toString("utf8"), TOKEN), { "content-type": type });
      }
      return send(res, 200, body, { "content-type": type });
    }

    if (req.method === "GET" && url.pathname === "/api/dirs") {
      const ai = aiConfig();
      return send(res, 200, {
        base: BASE,
        crawlDir: CRAWL_DIR,
        crawlFound: existsSync(CRAWL_DIR),
        dirs: listDateDirs(BASE),
        ai: { configured: Boolean(ai.key), model: ai.model },
      });
    }

    if (req.method === "GET" && url.pathname === "/api/glossary") {
      const { knownCharacters, error } = await loadKnownMods();
      return send(res, 200, {
        characters: [...(knownCharacters ?? [])].sort((a, b) => a.localeCompare(b, "zh")),
        dbError: error,
        glossary,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/scan") {
      const dateDir = safeDateDir(url.searchParams.get("dir") ?? "");
      const scan = scanDateDir(dateDir, { crawlDir: CRAWL_DIR, summaryDir: SUMMARY_DIR });
      const { knownCharacters } = await loadKnownMods();
      return send(res, 200, {
        ...scan,
        dateDir,
        suggestions: Object.fromEntries(scan.sources.flatMap((s) => Object.entries(suggestFor(s.items, knownCharacters)))),
      });
    }

    // 词表没搞定的条目交给 DeepSeek（角色白名单硬校验，失败只报错不阻塞）
    if (req.method === "POST" && url.pathname === "/api/ai/suggest") {
      const body = await readBody(req);
      const dateDir = safeDateDir(body.dir ?? "");
      const sourceDir = safeSourceDir(dateDir, body.source ?? "");
      const sourceName = body.source;
      const { knownCharacters, error: dbError } = await loadKnownMods();
      if (!knownCharacters) throw new Error(dbError || "拿不到库内角色清单");

      const scan = scanDateDir(dateDir, { crawlDir: CRAWL_DIR, summaryDir: SUMMARY_DIR });
      const source = scan.sources.find((s) => s.name === sourceName);
      if (!source) throw new Error(`来源目录里没有条目：${sourceName}`);

      const wanted = Array.isArray(body.names) && body.names.length ? new Set(body.names) : null;
      const suggestions = suggestFor(source.items, knownCharacters);
      const items = source.items
        .filter((it) => (wanted ? wanted.has(it.name) : needsAi(suggestions[it.name])))
        // 词表/分类已经定下的角色一起带上：模型只补名称，别把角色改掉
        .map((it) => ({ name: it.name, base: it.base, meta: it.meta, characters: suggestions[it.name]?.characters ?? [] }));

      if (!items.length) return send(res, 200, { results: {}, errors: [], model: aiConfig().model });
      const { results, errors } = await suggestWithModel({ items, glossary, knownCharacters, config: aiConfig() });
      return send(res, 200, { results, errors, model: aiConfig().model, sourceDir: sourceDir });
    }

    // 合集包的顶层目录树 + 每个目录的命名建议（拆包向导用）
    if (req.method === "GET" && url.pathname === "/api/zip") {
      const dateDir = safeDateDir(url.searchParams.get("dir") ?? "");
      const sourceDir = safeSourceDir(dateDir, url.searchParams.get("source") ?? "");
      const name = url.searchParams.get("name") ?? "";
      if (!/\.zip$/i.test(name)) throw new Error("只有 .zip 合集包可以拆");
      const zipPath = safeEntryPath(sourceDir, name);
      const info = inspectZip(zipPath);
      const suggests = Object.fromEntries(
        info.topLevel.map((t) => {
          const s = translate(t.name, glossary, {});
          return [t.name, s];
        })
      );
      return send(res, 200, { name, ...info, suggests, images: siblingsOf(sourceDir, name) });
    }

    // 预览图字节（页面用 canvas 裁封面时必须能读到本地图）
    if (req.method === "GET" && url.pathname === "/api/asset") {
      const dateDir = safeDateDir(url.searchParams.get("dir") ?? "");
      const sourceDir = safeSourceDir(dateDir, url.searchParams.get("source") ?? "");
      const file = safeEntryPath(sourceDir, url.searchParams.get("name") ?? "");
      const type = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[
        extname(file).toLowerCase()
      ];
      if (!type) throw new Error("只允许读取预览图");
      return send(res, 200, readFileSync(file), { "content-type": type });
    }

    // 拆包：按顶层目录拆成多个单角色 zip，并写入裁好的封面
    if (req.method === "POST" && url.pathname === "/api/split") {
      const body = await readBody(req);
      if (body.confirm !== true) throw new Error("缺少 confirm: true");
      const dateDir = safeDateDir(body.dir ?? "");
      const sourceDir = safeSourceDir(dateDir, body.source ?? "");
      if (!/\.zip$/i.test(body.zip ?? "")) throw new Error("只有 .zip 合集包可以拆");
      const zipPath = safeEntryPath(sourceDir, body.zip);

      const covers = {};
      for (const [pack, dataUrl] of Object.entries(body.covers ?? {})) {
        const m = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl));
        if (!m) throw new Error(`封面格式不对：${pack}`);
        const buf = Buffer.from(m[1], "base64");
        if (buf.length > 20 * 1024 * 1024) throw new Error(`封面太大：${pack}`);
        covers[pack] = buf;
      }

      const result = splitZip({
        zipPath,
        sourceDir,
        groups: body.groups ?? [],
        covers,
        archive: body.archive !== false,
        ignore: body.ignore ?? [],
      });
      return send(res, 200, {
        packs: result.packs,
        archived: result.archived,
        ignored: result.ignored,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/plan") {
      const body = await readBody(req);
      const dateDir = safeDateDir(body.dir ?? "");
      return send(res, 200, await planRows(dateDir, body.rows ?? []));
    }

    if (req.method === "POST" && url.pathname === "/api/apply") {
      const body = await readBody(req);
      if (body.confirm !== true) throw new Error("缺少 confirm: true");
      const dateDir = safeDateDir(body.dir ?? "");
      const entries = (body.entries ?? []).map((e) => ({
        from: e.from,
        to: e.to,
        // 每条自己带来源：一次应用可以横跨 arca.live 与 GameBanana
        dir: e.source ? safeSourceDir(dateDir, e.source) : dateDir,
      }));
      // 同一帖子的多个附件：把分组写进日期目录的 .mod-groups.json，供每日上传脚本合并
      const postGroups = normalizeIncomingPostGroups(body.postGroups ?? []);
      let manifest = null;
      if (postGroups.length > 0) {
        const content = buildModGroupsFileContent(readModGroupsFile(dateDir), postGroups);
        if (content) manifest = { path: modGroupsPath(dateDir), content };
      }
      const result = applyPlan({ dir: dateDir, entries, journalDir: JOURNAL_DIR, label: body.label ?? "", manifest });
      return send(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/api/journals") {
      return send(res, 200, { journals: listJournals(JOURNAL_DIR) });
    }

    if (req.method === "POST" && url.pathname === "/api/undo") {
      const body = await readBody(req);
      if (body.confirm !== true) throw new Error("缺少 confirm: true");
      return send(res, 200, undoJournal({ journalDir: JOURNAL_DIR, id: body.id ?? "" }));
    }

    return send(res, 404, "not found");
  } catch (err) {
    // 本地工具，栈比「友好文案」有用：出错就原样打到终端
    console.error(`[${req.method} ${url.pathname}]`, err);
    // 控制台窗口经常被最小化/关掉，页面只显示一行 message；同时落一份到文件，
    // 事后才能看出是哪条改名/哪个目标出的问题。
    try {
      appendFileSync(
        join(HERE, ".errors.log"),
        `${new Date().toISOString()}\t${req.method} ${url.pathname}\t${String(err?.stack ?? err)}\n`,
        "utf8"
      );
    } catch {
      // 写日志失败不影响返回错误
    }
    return send(res, 400, { error: String(err?.message ?? err) });
  }
});

function openInBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, { windowsHide: true }, () => {
    // 打不开浏览器不影响服务本身，URL 已经打在终端里了
  });
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  端口 ${PORT} 已被占用 —— 多半是已经开着一个命名工坊窗口。`);
    console.error(`  关掉那个窗口（或任务管理器里结束 node.exe）再启动。\n`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/?t=${TOKEN}`;
  console.log(`\n  Mod 命名工坊\n  ${url}\n`);
  // token 只在控制台里，窗口关掉/最小化后经常找不到；同时落一份文件方便找回
  // （本机 127.0.0.1 工具，token 只防别的网页跨站调用，不是账号凭证）
  try {
    writeFileSync(join(HERE, ".url"), `${url}\n`, "utf8");
  } catch {
    // 写不进去也不影响启动
  }
  console.log(`  数据目录：${BASE}`);
  console.log(`  爬虫状态：${CRAWL_DIR}${existsSync(CRAWL_DIR) ? "" : "（不存在，只能靠文件名猜）"}`);
  console.log(`  撤销记录：${JOURNAL_DIR}`);
  console.log(`\n  用完关掉这个窗口即可（Ctrl+C 或直接关窗）。\n`);
  if (OPEN_BROWSER) openInBrowser(url);
});
