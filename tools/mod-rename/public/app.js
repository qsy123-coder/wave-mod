/**
 * 页面逻辑：扫描 → 逐条编辑 → 校验 → 应用 / 撤销。
 * 没有框架，DOM 用 createElement 拼 —— 所有用户数据都走 textContent / value，不拼 innerHTML。
 */
const TOKEN = new URLSearchParams(location.search).get("t") ?? "";

const state = {
  dir: "",
  sources: [],
  suggestion: {}, // name -> { characters[], name, hotkeys, author, confidence, leftover }
  plan: {}, // name -> plan row
  selected: new Set(),
  touched: new Set(),
  characters: [],
  journals: [],
  ai: { configured: false, model: "" },
  aiRunning: false,
};

const $ = (id) => document.getElementById(id);

/**
 * 渲染缓存：plan 刷新只更新「结果/校验」这些派生节点，**绝不重建输入框**。
 * 之前每次 400ms 去抖后都 replaceChildren 整个列表，正在打字的光标会跟着输入框一起消失 ——
 * 角色认不出来、需要手输的时候尤其打断人。
 */
let layoutKey = "";
const rowViews = new Map(); // 条目名 -> { update() }
const sectionViews = new Map(); // 来源名 -> { update() }
let planSeq = 0;

async function api(path, { method = "GET", body, timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        "x-rename-token": TOKEN,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`请求超时（>${Math.round(timeoutMs / 1000)} 秒）`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function banner(message, { scroll = false } = {}) {
  const el = $("banner");
  el.hidden = !message;
  el.textContent = message ?? "";
  // 顶栏在页面最上方，滚下去看表格时提示是看不见的 —— 关键提示顺手带过来
  if (message && scroll) el.scrollIntoView({ block: "nearest" });
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

// ---------------- 数据流 ----------------

async function loadDirs() {
  const data = await api("/api/dirs");
  state.dirs = data.dirs;
  state.ai = data.ai ?? { configured: false, model: "" };
  const sel = $("dir-select");
  sel.replaceChildren(...data.dirs.map((d) => el("option", { value: d.name, text: d.name })));
  $("meta-line").textContent = `数据目录：${data.base}　·　爬虫状态：${data.crawlFound ? data.crawlDir : "未找到（只能靠文件名猜）"}`;
  if (!data.dirs.length) {
    banner(`没有找到任何 W-YYYY.M.D 目录：${data.base}`);
    return;
  }
  state.dir = data.dirs[0].name;
  sel.value = state.dir;
  await loadScan();
  await loadGlossary();
  await loadJournals();
}

async function loadGlossary() {
  try {
    const data = await api("/api/glossary");
    state.characters = data.characters ?? [];
    // 角色清单晚于首次扫描返回：立刻刷一次下拉候选，否则要等下次输入才生效
    render();
    if (data.dbError) banner(data.dbError + "（角色未校验，需先修好 psql / DATABASE_URL）");
  } catch (err) {
    banner(String(err.message));
  }
}

async function loadScan() {
  const data = await api(`/api/scan?dir=${encodeURIComponent(state.dir)}`);
  state.sources = data.sources;
  state.suggestion = data.suggestions ?? {};
  state.plan = {};
  state.selected = new Set();
  state.touched = new Set();
  layoutKey = ""; // 重新扫描后条目对象全换了：强制重建，别复用旧行
  render();
  await refreshPlan();
}

/** 把当前所有行（含用户改动）发给服务端校验 */
let planTimer = null;
function schedulePlan() {
  clearTimeout(planTimer);
  planTimer = setTimeout(refreshPlan, 400);
}

async function refreshPlan() {
  banner("");
  // 过期的响应不能再盖掉用户刚敲进去的字：每次请求编号，只有最后一次生效
  const seq = ++planSeq;
  const dir = state.dir;
  const rows = state.sources.flatMap((s) =>
    s.items.map((item) => {
      const s0 = state.suggestion[item.name] ?? {};
      return {
        source: s.name,
        from: item.name,
        meta: item.meta,
        characters: s0.characters ?? [],
        name: s0.name ?? "",
        hotkeys: s0.hotkeys ?? "",
        author: s0.author ?? "",
        confidence: s0.confidence ?? "high",
        leftover: s0.leftover ?? [],
      };
    })
  );
  try {
    const data = await api("/api/plan", { method: "POST", body: { dir: state.dir, rows } });
    if (seq !== planSeq || dir !== state.dir) return; // 过期计划，丢弃
    state.plan = {};
    for (const src of data.sources) for (const row of src.rows) state.plan[row.from] = row;
    if (data.knownError) banner(data.knownError + "（角色未校验）");
    // 没被用户手动勾过的行，默认跟随「可应用」
    for (const [name, row] of Object.entries(state.plan)) {
      if (state.touched.has(name)) continue;
      if (row.applicable) state.selected.add(name);
      else state.selected.delete(name);
    }
  } catch (err) {
    banner(String(err.message));
  }
  render();
}

// ---------------- 渲染 ----------------

function render() {
  // 角色下拉的候选来自库内 distinct —— 这是唯一合法的角色来源
  const datalist = $("char-list");
  const charKey = state.characters.join("\u0000");
  if (datalist.dataset.key !== charKey) {
    datalist.dataset.key = charKey;
    datalist.replaceChildren(...state.characters.map((c) => el("option", { value: c })));
  }
  const root = $("sources");
  const key = state.sources
    .map((s) => `${s.name}\u0000${s.items.map((i) => i.name).join("\u0001")}`)
    .join("\u0002");
  if (key !== layoutKey) {
    // 条目集合真的变了（切日期 / 改名后重扫）才重建
    layoutKey = key;
    rowViews.clear();
    sectionViews.clear();
    root.replaceChildren(...state.sources.map(renderSource));
  } else {
    // 只是 plan 刷新：就地更新派生节点，不动输入框（见文件头 layoutKey 的注释）
    for (const view of sectionViews.values()) view.update();
    for (const view of rowViews.values()) view.update();
  }
  renderFooter();
}

/** 正在输入的框不覆盖 —— AI 结果/计划刷新回来时不能抢走光标 */
function setInputValue(input, value) {
  if (document.activeElement === input) return;
  if (input.value !== value) input.value = value;
}

/** 「要不要 AI」以服务端算出来的为准（lib/ai.mjs 的 needsAi），页面不再重复一套规则 */
function needsAiFor(name) {
  const s = state.suggestion[name];
  if (!s) return true;
  return s.needsAi ?? !(s.characters ?? []).length;
}

function renderSource(src) {
  const count = el("span", { class: "count" });
  const aiSlot = el("span", { class: "ai-slot" });
  const head = el("h2", {}, [el("span", { text: src.name }), count, aiSlot]);
  const rows = el("div", { class: "rows" }, src.items.map(renderRow));
  const section = el("section", { class: "source" }, [head, rows]);
  const view = { src, count, aiSlot, update: () => updateSection(view) };
  sectionViews.set(src.name, view);
  updateSection(view);
  return section;
}

function updateSection(view) {
  const { src } = view;
  const applicable = src.items.filter((i) => state.plan[i.name]?.applicable).length;
  view.count.textContent = `${src.items.length} 条 · 可应用 ${applicable}`;
  view.aiSlot.replaceChildren(aiButton(src));
}

function aiButton(src) {
  const pending = src.items.filter((i) => needsAiFor(i.name));
  if (state.aiRunning) return el("button", { class: "ghost btn-ai", text: "补全中…", disabled: "disabled" });
  if (!state.ai.configured) {
    return el("button", {
      class: "ghost btn-ai",
      text: "AI 未配置",
      disabled: "disabled",
      title: "在 .env.local 写 DEEPSEEK_API_KEY，然后重开本工具",
    });
  }
  // 0 条时不留一个灰按钮（看着像功能没了），直接说明「不用补」
  return pending.length
    ? el("button", {
        class: "ghost btn-ai",
        text: `AI 补全 ${pending.length}`,
        title: `用 ${state.ai.model} 补全这 ${pending.length} 条（词表没搞定的）`,
        onclick: () => runAi(src.name, pending.map((i) => i.name)),
      })
    : el("span", { class: "count", text: "全部已识别，无需 AI" });
}

/** 用户改了某个字段：写回 state，稍后再让服务端重算计划 */
function patchSuggestion(name, patch) {
  const s = state.suggestion[name] ?? {};
  Object.assign(s, patch);
  state.suggestion[name] = s;
  state.touched.add(name);
  schedulePlan();
}

function renderRow(item) {
  const checkbox = el("input", {
    type: "checkbox",
    onchange: (e) => {
      state.touched.add(item.name);
      if (e.target.checked) state.selected.add(item.name);
      else state.selected.delete(item.name);
      renderFooter();
    },
  });

  const metaSub = item.meta
    ? el("span", {
        class: "sub",
        text: `原帖：${item.meta.title || "—"}　作者：${item.meta.author || "—"}${
          item.meta.subcategory ? `　分类：${item.meta.subcategory}` : ""
        }`,
      })
    : el("span", { class: "sub", text: "没有找到原帖信息" });

  const orig = el("div", { class: "orig" }, [
    el("span", { text: item.name }),
    el("span", { class: "sub", text: `${item.kind}　${item.isDir ? "" : fmtSize(item.size)}` }),
    metaSub,
  ]);

  const charInput = el("input", {
    type: "text",
    list: "char-list",
    placeholder: "角色",
    oninput: (e) =>
      patchSuggestion(item.name, {
        characters: e.target.value.split(/[,，、]/).map((x) => x.trim()).filter(Boolean),
      }),
    // 失焦时才把 state 里的值同步回输入框（AI 结果在输入中不会抢字）
    onblur: () => updateRow(view),
  });

  const nameInput = el("input", {
    type: "text",
    placeholder: "名称",
    oninput: (e) => patchSuggestion(item.name, { name: e.target.value }),
    onblur: () => updateRow(view),
  });

  const hotkeyInput = el("input", {
    type: "text",
    placeholder: "切换键",
    oninput: (e) => patchSuggestion(item.name, { hotkeys: e.target.value }),
    onblur: () => updateRow(view),
  });

  const authorInput = el("input", {
    type: "text",
    placeholder: "作者",
    oninput: (e) => patchSuggestion(item.name, { author: e.target.value }),
    onblur: () => updateRow(view),
  });

  const key = el("div", { class: "key" });
  const chips = el("div", {});
  const issues = el("ul", { class: "issues" });

  const canSplit = item.kind === "mod" && item.ext === ".zip";
  const splitBtn = canSplit
    ? el("button", { class: "btn-split", text: "拆包…", onclick: () => openSplit(state.plan[item.name]) })
    : null;

  const result = el("div", { class: "result" }, [key, chips, issues, splitBtn]);
  const row = el("div", { class: "row" }, [checkbox, orig, charInput, nameInput, hotkeyInput, authorInput, result]);

  const view = {
    item,
    refs: { row, checkbox, charInput, nameInput, hotkeyInput, authorInput, key, chips, issues },
    update: () => updateRow(view),
  };
  rowViews.set(item.name, view);
  updateRow(view);
  return row;
}

/** 只改派生节点与未聚焦的输入框；正在输入的那个框一个字都不碰 */
function updateRow(view) {
  const { item, refs } = view;
  const s = state.suggestion[item.name] ?? {};
  const plan = state.plan[item.name];
  const blocked = Boolean(plan && !plan.applicable);

  refs.checkbox.checked = state.selected.has(item.name);
  refs.checkbox.disabled = blocked;
  setInputValue(refs.charInput, (s.characters ?? []).join(","));
  setInputValue(refs.nameInput, s.name ?? "");
  setInputValue(refs.hotkeyInput, s.hotkeys ?? "");
  setInputValue(refs.authorInput, s.author ?? "");

  refs.row.className = `row${blocked ? " blocked disabled" : ""}`;
  refs.key.textContent = plan?.display || "—";
  refs.chips.replaceChildren(...chipsFor(item, s, plan));
  refs.issues.replaceChildren(
    ...(plan?.issues ?? []).map((i) => el("li", { class: i.level, text: `${iconFor(i.level)} ${i.message}` }))
  );
}

function chipsFor(item, s, plan) {
  const chips = [
    plan?.alreadyNamed
      ? el("span", { class: "chip", text: "已是规范名" })
      : el("span", {
          class: plan?.applicable ? "chip ok" : "chip bad",
          text: plan?.applicable ? `可应用（改 ${plan.changed} 项）` : "不可应用",
        }),
  ];
  if (item.images?.length > 0) chips.push(el("span", { class: "chip", text: `带 ${item.images.length} 张预览图` }));
  if (s.viaModel) chips.push(el("span", { class: "chip", text: "AI" }));
  if (s.confidence === "low") chips.push(el("span", { class: "chip", text: "词表未完全命中" }));
  return chips;
}

// ---------------- AI 补全 ----------------

async function runAi(source, names) {
  if (!names.length || state.aiRunning) return;
  state.aiRunning = true;
  const started = Date.now();
  banner(`正在让 ${state.ai.model} 补全 ${names.length} 条…（通常 5–20 秒，别关窗口）`, { scroll: true });
  render(); // 按钮立刻变成「补全中…」，否则点完像没反应
  try {
    const res = await api("/api/ai/suggest", {
      method: "POST",
      body: { dir: state.dir, source, names },
      timeoutMs: 120_000,
    });
    let n = 0;
    for (const [name, r] of Object.entries(res.results ?? {})) {
      const prev = state.suggestion[name] ?? {};
      // 部分结果也要落地：模型只认出角色、或只翻出名称时，不能把原来那半边擦掉。
      // 角色以词表/分类为准：已经定出来的（如子分类 `Yangyang: Xuanling` → 玄翎）不让模型改。
      state.suggestion[name] = {
        ...prev,
        characters: prev.characters?.length ? prev.characters : r.characters ?? [],
        name: r.name || prev.name || "",
        hotkeys: r.hotkeys || prev.hotkeys || "",
        author: r.author || prev.author || "",
        confidence: "high",
        needsAi: false,
        leftover: [],
        viaModel: true,
      };
      state.touched.delete(name); // 交给「默认勾选可应用」重新判断
      n++;
    }
    await refreshPlan();
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const fails = res.errors ?? [];
    // 失败逐条报出来：静默丢弃时用户只会以为「AI 什么都没干」
    const failText = fails.length
      ? `${fails.length} 条没补上：${fails.slice(0, 5).join("；")}${fails.length > 5 ? "…" : ""}`
      : "";
    banner(
      n
        ? `AI 补全 ${n} 条（${res.model}，用时 ${secs}s）—— 只填了表单，确认无误后点右下角「应用已选」才会真正改名${failText ? `；${failText}` : ""}`
        : `AI 没有给出可用结果（用时 ${secs}s）：${failText || "模型没返回可用条目"}`,
      { scroll: true }
    );
  } catch (err) {
    banner(`AI 补全失败：${err.message}`, { scroll: true });
  } finally {
    state.aiRunning = false;
    render();
  }
}

// ---------------- 拆包 ----------------

const split = { row: null, item: null, info: null, groups: [], img: null, imageName: "", slices: [], mapping: [] };

function findItem(name) {
  for (const s of state.sources) {
    const hit = s.items.find((i) => i.name === name);
    if (hit) return { ...hit, sourceName: s.name };
  }
  return null;
}

/** 客户端版的 composeKey（与服务端 composeKey 同规则，只用于预填，最终以服务端校验为准） */
function composePackName({ character, name, hotkeys, author }) {
  const chars = String(character ?? "").split(/[,，、]/).map((x) => x.trim()).filter(Boolean).join(",");
  const n = String(name ?? "").replace(/\s+/g, " ").trim();
  let key = chars && n ? `${chars}-${n}` : chars || n;
  const hk = String(hotkeys ?? "").trim();
  if (hk) key += `（${hk}）`;
  const au = String(author ?? "").trim();
  if (au) key += ` by ${au}`;
  return key.trim();
}

async function openSplit(row) {
  const item = findItem(row.from);
  if (!item) return banner("找不到这个条目，刷新一下再试");
  banner("");
  try {
    const info = await api(
      `/api/zip?dir=${encodeURIComponent(state.dir)}&source=${encodeURIComponent(item.sourceName)}&name=${encodeURIComponent(item.name)}`
    );
    split.row = row;
    split.item = item;
    split.info = info;
    split.slices = [];
    split.mapping = [];

    const rowSug = state.suggestion[item.name] ?? {};
    const used = new Set();
    split.groups = info.topLevel.map((t) => {
      const s = info.suggests?.[t.name] ?? {};
      // 目录名本身就是中文角色名时（如「今汐 白」），直接从库内角色里认一个
      const character =
        (s.characters ?? [])[0] ?? state.characters.find((c) => c && t.name.includes(c)) ?? "";
      let packName = composePackName({
        character,
        name: rowSug.name || s.name || t.name,
        hotkeys: rowSug.hotkeys ?? "",
        author: rowSug.author ?? "",
      });
      if (!packName) packName = t.name;
      if (used.has(packName)) packName = `${packName}（${t.name}）`;
      used.add(packName);
      return { top: t.name, character, packName, ignore: false, files: t.files, bytes: t.bytes };
    });

    // 合集长图：优先同名图
    const base = item.base;
    const imgName =
      info.images.find((n) => n.replace(/\.[^.]+$/, "") === base) ?? info.images[0] ?? "";
    split.imageName = imgName;
    split.img = imgName ? await loadImage(`/api/asset?dir=${encodeURIComponent(state.dir)}&source=${encodeURIComponent(item.sourceName)}&name=${encodeURIComponent(imgName)}`) : null;

    renderSplit();
    document.getElementById("split-dialog").showModal();
  } catch (err) {
    banner(String(err.message));
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`读取封面图失败：${src}`));
    img.src = `${src}${src.includes("?") ? "&" : "?"}t=${encodeURIComponent(TOKEN)}`;
  });
}

function renderSplit() {
  $("split-title").textContent = `拆包：${split.item.name}`;
  $("split-hint").textContent = `共 ${split.info.topLevel.length} 个顶层目录 · ${fmtSize(split.info.totals.bytes)}　（每一行拆成一个单角色包）`;

  const rows = split.groups.map((g, i) => {
    const checkbox = el("input", {
      type: "checkbox",
      checked: g.ignore ? undefined : "checked",
      onchange: (e) => {
        g.ignore = !e.target.checked;
        renderSplit();
      },
    });
    const name = el("div", { class: "name" }, [
      el("span", { text: g.top || "(根目录文件)" }),
      el("span", { class: "sub", text: `${g.files} 个文件 · ${fmtSize(g.bytes)}` }),
    ]);
    const char = el("input", {
      type: "text",
      value: g.character,
      list: "char-list",
      placeholder: "角色",
      oninput: (e) => {
        g.character = e.target.value.split(/[,，、]/)[0]?.trim() ?? "";
        g.packName = composePackName({
          character: g.character,
          name: state.suggestion[split.item.name]?.name ?? "",
          hotkeys: state.suggestion[split.item.name]?.hotkeys ?? "",
          author: state.suggestion[split.item.name]?.author ?? "",
        }) || g.packName;
        $("split-pack-" + i).value = g.packName;
      },
    });
    const pack = el("input", {
      type: "text",
      id: "split-pack-" + i,
      value: g.packName,
      oninput: (e) => {
        g.packName = e.target.value;
      },
    });
    return el("div", { class: "split-top" }, [checkbox, name, char, pack]);
  });
  $("split-tops").replaceChildren(...rows);

  const box = $("split-cover-box");
  if (!split.img || split.groups.length === 0) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  requestAnimationFrame(() => renderStrips());
}

function activeGroups() {
  return split.groups
    .map((g, gi) => ({ g, gi }))
    .filter(({ g }) => !g.ignore);
}

function renderStrips() {
  const active = activeGroups();
  const n = active.length;
  const w = split.img.naturalWidth;
  const h = split.img.naturalHeight;
  split.slices = [];
  split.mapping = active.map(({ gi }) => gi);

  const strips = [];
  for (let i = 0; i < n; i++) {
    const x0 = Math.round((w * i) / n);
    const x1 = Math.round((w * (i + 1)) / n);
    const canvas = document.createElement("canvas");
    canvas.width = x1 - x0;
    canvas.height = h;
    canvas.getContext("2d").drawImage(split.img, x0, 0, x1 - x0, h, 0, 0, x1 - x0, h);
    const dataUrl = canvas.toDataURL("image/png");
    split.slices.push(dataUrl);

    const select = el(
      "select",
      {
        onchange: (e) => {
          split.mapping[i] = Number(e.target.value);
        },
      },
      [
        ...active.map(({ g, gi }) => el("option", { value: String(gi), text: g.packName || `包 ${gi + 1}` })),
        el("option", { value: "-1", text: "不使用" }),
      ]
    );
    select.value = String(split.mapping[i]);

    strips.push(
      el("div", { class: "strip" }, [
        el("img", { src: dataUrl, alt: `面板 ${i + 1}` }),
        el("label", {}, [el("span", { text: `面板 ${i + 1} 用作` }), select]),
      ])
    );
  }
  $("split-strips").replaceChildren(...strips);
}

async function applySplit() {
  const err = $("split-error");
  err.hidden = true;
  const groups = split.groups.filter((g) => !g.ignore);
  if (!groups.length) {
    err.hidden = false;
    err.textContent = "至少要保留一个包";
    return;
  }
  const covers = {};
  for (let i = 0; i < split.slices.length; i++) {
    const target = split.mapping[i];
    if (target < 0) continue;
    const g = split.groups[target];
    if (!g || g.ignore || !g.packName.trim()) continue;
    covers[g.packName.trim()] = split.slices[i];
  }
  const ignore = split.groups.filter((g) => g.ignore).map((g) => g.top);

  $("split-apply").disabled = true;
  try {
    const res = await api("/api/split", {
      method: "POST",
      body: {
        dir: state.dir,
        source: split.item.sourceName,
        zip: split.item.name,
        confirm: true,
        archive: $("split-archive").checked,
        groups: groups.map((g) => ({ packName: g.packName.trim(), tops: [g.top] })),
        ignore,
        covers,
      },
    });
    document.getElementById("split-dialog").close();
    await loadScan();
    banner(
      `已拆出 ${res.packs.length} 个包（${res.packs.map((p) => p.packName).join("、")}）` +
        (res.archived?.length ? `；已归档 ${res.archived.length} 个源文件到 _合集原包/` : "")
    );
  } catch (e) {
    err.hidden = false;
    err.textContent = String(e.message);
  } finally {
    $("split-apply").disabled = false;
  }
}

function iconFor(level) {
  return level === "block" ? "✕" : level === "warn" ? "!" : "·";
}

function fmtSize(n) {
  if (!n) return "";
  const mb = n / 1048576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

function renderFooter() {
  const selected = [...state.selected].filter((n) => state.plan[n]?.applicable);
  $("btn-apply").disabled = !selected.length;
  $("btn-apply").textContent = selected.length ? `应用已选 ${selected.length} 项` : "应用已选";

  const rows = Object.values(state.plan);
  const dup = rows.filter((r) => r.issues.some((i) => i.code === "duplicate")).length;
  const blocked = rows.filter((r) => !r.applicable && !r.alreadyNamed).length;
  const already = rows.filter((r) => r.alreadyNamed).length;
  const todo = rows.filter((r) => r.applicable).length;
  $("stats").textContent =
    `共 ${rows.length} 条 · 可应用 ${todo} · 不可应用 ${blocked} · 已是规范名 ${already} · 库内已有去重键 ${dup}`;

  const last = state.journals.find((j) => j.status === "applied");
  const undo = $("btn-undo");
  undo.disabled = !last;
  undo.textContent = last ? `撤销上一批（${last.count} 项）` : "撤销上一批";
  undo.dataset.id = last?.id ?? "";
}

// ---------------- 操作 ----------------

async function applySelected() {
  const picked = [...state.selected].filter((n) => state.plan[n]?.applicable);
  // 一行可能对应多个改名（主条目 + 预览图），这里摊平；顺便带上来源，服务端据此定位目录
  const entries = picked.flatMap((n) => {
    const row = state.plan[n];
    return (row.targets ?? []).map((t) => ({ ...t, source: row.source }));
  });
  if (!entries.length) return;

  // 同一 GameBanana 帖子的多个附件 → 服务端写 .mod-groups.json。
  // 只提交「至少有一行被勾选」的帖子，但带上该帖子的全部变体（有些可能已经命名好、没勾选）。
  const pickedPosts = new Set(picked.map((n) => state.plan[n]?.postUrl).filter(Boolean));
  const byPost = new Map();
  for (const row of Object.values(state.plan)) {
    if (!row?.postUrl || !row.variantLabel || !pickedPosts.has(row.postUrl)) continue;
    const group = byPost.get(row.postUrl) ?? { postUrl: row.postUrl, variants: [] };
    const name = String(row.applicable ? (row.display ?? row.to ?? row.from) : row.from).replace(
      /\.(exe|zip|7z|rar)$/i,
      ""
    );
    group.variants.push({
      label: row.variantLabel,
      name,
      localName: row.from ?? "",
      sourceName: row.src ?? "",
      isBase: Boolean(row.isBaseVariant),
    });
    byPost.set(row.postUrl, group);
  }
  const postGroups = [...byPost.values()]
    .map((group) => ({
      ...group,
      variants: [...new Map(group.variants.map((variant) => [variant.name, variant])).values()],
    }))
    .filter((group) => group.variants.length >= 2);

  if (!confirm(`将改名 ${entries.length} 项（${picked.length} 个 mod，只改名、不动内容），继续？`)) return;

  $("btn-apply").disabled = true;
  try {
    const res = await api("/api/apply", {
      method: "POST",
      body: { dir: state.dir, confirm: true, entries, label: state.dir, postGroups },
    });
    await loadScan();
    await loadJournals();
    banner(`已改名 ${res.ops.length} 项${res.skipped.length ? `，跳过 ${res.skipped.length} 项` : ""}。可随时点右下角撤销。`);
  } catch (err) {
    banner(String(err.message));
  } finally {
    renderFooter();
  }
}

async function undoLast() {
  const id = $("btn-undo").dataset.id;
  if (!id) return;
  if (!confirm("把上一批改名撤销回原名？")) return;
  try {
    const res = await api("/api/undo", { method: "POST", body: { id, confirm: true } });
    await loadScan();
    await loadJournals();
    banner(
      `已恢复 ${res.restored} 项${res.failures?.length ? `；${res.failures.length} 项失败：${res.failures.join("；")}` : ""}`
    );
  } catch (err) {
    banner(String(err.message));
  }
}

async function loadJournals() {
  try {
    const data = await api("/api/journals");
    state.journals = data.journals ?? [];
    renderJournals();
    renderFooter();
  } catch {
    // 记录读不到不影响主流程
  }
}

function renderJournals() {
  const box = $("journals");
  const items = state.journals.filter((j) => j.status === "applied").slice(0, 5);
  if (!items.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.replaceChildren(
    el("h2", { text: "最近可撤销的批次" }),
    el(
      "ul",
      {},
      items.map((j) =>
        el("li", { text: `${new Date(j.createdAt).toLocaleString()} · ${j.count} 项 · ${j.dir}` })
      )
    )
  );
}

// ---------------- 启动 ----------------

$("dir-select").addEventListener("change", async (e) => {
  state.dir = e.target.value;
  await loadScan();
  await loadJournals();
});
$("btn-reload").addEventListener("click", () => loadScan().then(loadJournals));
$("btn-apply").addEventListener("click", applySelected);
$("btn-undo").addEventListener("click", undoLast);
$("split-cancel").addEventListener("click", () => $("split-dialog").close());
$("split-apply").addEventListener("click", applySplit);

// 角色下拉容器（内容在 render() 里按库内角色刷新）
document.body.appendChild(el("datalist", { id: "char-list" }));

loadDirs().catch((err) => banner(String(err.message)));
