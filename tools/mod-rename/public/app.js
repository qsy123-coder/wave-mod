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
};

const $ = (id) => document.getElementById(id);

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      "x-rename-token": TOKEN,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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

function banner(message) {
  const el = $("banner");
  el.hidden = !message;
  el.textContent = message ?? "";
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
  if (datalist.options.length !== state.characters.length) {
    datalist.replaceChildren(...state.characters.map((c) => el("option", { value: c })));
  }
  const root = $("sources");
  root.replaceChildren(...state.sources.map(renderSource));
  renderFooter();
}

function renderSource(src) {
  const applicable = src.items.filter((i) => state.plan[i.name]?.applicable).length;
  const head = el("h2", {}, [
    el("span", { text: src.name }),
    el("span", { class: "count", text: `${src.items.length} 条 · 可应用 ${applicable}` }),
  ]);
  const rows = el("div", { class: "rows" }, src.items.map(renderRow));
  return el("section", { class: "source" }, [head, rows]);
}

function renderRow(item) {
  const s = state.suggestion[item.name] ?? {};
  const plan = state.plan[item.name];
  const checked = state.selected.has(item.name);
  const blocked = plan && !plan.applicable;

  const checkbox = el("input", {
    type: "checkbox",
    checked: checked ? "checked" : undefined,
    disabled: blocked ? "disabled" : undefined,
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
    value: (s.characters ?? []).join(","),
    list: "char-list",
    placeholder: "角色",
    oninput: (e) => {
      state.touched.add(item.name);
      s.characters = e.target.value.split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
      state.suggestion[item.name] = s;
      schedulePlan();
    },
  });

  const nameInput = el("input", {
    type: "text",
    value: s.name ?? "",
    placeholder: "名称",
    oninput: (e) => {
      state.touched.add(item.name);
      s.name = e.target.value;
      state.suggestion[item.name] = s;
      schedulePlan();
    },
  });

  const hotkeyInput = el("input", {
    type: "text",
    value: s.hotkeys ?? "",
    placeholder: "切换键",
    oninput: (e) => {
      state.touched.add(item.name);
      s.hotkeys = e.target.value;
      state.suggestion[item.name] = s;
      schedulePlan();
    },
  });

  const authorInput = el("input", {
    type: "text",
    value: s.author ?? "",
    placeholder: "作者",
    oninput: (e) => {
      state.touched.add(item.name);
      s.author = e.target.value;
      state.suggestion[item.name] = s;
      schedulePlan();
    },
  });

  const issues = el(
    "ul",
    { class: "issues" },
    (plan?.issues ?? []).map((i) => el("li", { class: i.level, text: `${iconFor(i.level)} ${i.message}` }))
  );

  const extra =
    item.images?.length > 0
      ? el("span", { class: "chip", text: `带 ${item.images.length} 张预览图` })
      : null;
  const stateChip = plan?.alreadyNamed
    ? el("span", { class: "chip", text: "已是规范名" })
    : el("span", {
        class: plan?.applicable ? "chip ok" : "chip bad",
        text: plan?.applicable ? `可应用（改 ${plan.changed} 项）` : "不可应用",
      });

  const result = el("div", { class: "result" }, [
    el("div", { class: "key", text: plan?.display || "—" }),
    el("div", {}, [stateChip, extra, s.confidence === "low" ? el("span", { class: "chip", text: "词表未完全命中" }) : null]),
    issues,
  ]);

  const checkedNow = state.selected.has(item.name);
  checkbox.checked = checkedNow;

  return el("div", { class: `row${blocked ? " blocked" : ""}${blocked ? " disabled" : ""}` }, [
    checkbox,
    orig,
    charInput,
    nameInput,
    hotkeyInput,
    authorInput,
    result,
  ]);
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
  if (!confirm(`将改名 ${entries.length} 项（${picked.length} 个 mod，只改名、不动内容），继续？`)) return;

  $("btn-apply").disabled = true;
  try {
    const res = await api("/api/apply", {
      method: "POST",
      body: { dir: state.dir, confirm: true, entries, label: state.dir },
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

// 角色下拉容器（内容在 render() 里按库内角色刷新）
document.body.appendChild(el("datalist", { id: "char-list" }));

loadDirs().catch((err) => banner(String(err.message)));
