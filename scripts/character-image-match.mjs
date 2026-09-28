/**
 * 「按角色目录补/换预览图」的匹配规则 —— 纯函数，无 IO，供单测锁住。
 *
 * 为什么要单独一个模块：这套匹配决定**把哪张图挂到哪一行**。挂错了不会报错，
 * 前台只会看到某条 mod 的预览图变成了别人的皮肤，事后极难发现是脚本干的。
 * 所以「命中唯一才动、命中 0 或多条一律不动」这条要写成可测的规则，而不是散在
 * 主流程的 if 里。
 */

/**
 * 去掉文件名尾部 Windows/浏览器重复下载留下的「重名后缀」` (2)` / `（3）`。
 * 与 upload-daily-by-date.mjs 的 stripRenameSuffix 同实现 —— 每天那批源目录里
 * 确实出现过 `弗洛洛-校园服饰v3.6（9） (2).png` 这种名字。
 * 只认行尾这一个后缀，`小卡-校园JK2.0（内附切换）` 这类名字里的括号不受影响。
 */
export function stripRenameSuffix(base) {
  return String(base).replace(/[(（]\d+[)）]$/, "").trim();
}

/**
 * 源图文件名 → 库内 title 的**候选**写法，按可信度从高到低。
 *
 * 库内同一个角色的 title 有两种历史写法，两种都要试：
 *   1. 完整 key（带「角色-」前缀）—— `今汐-A2 (左右切换）`
 *   2. 已剥前缀           —— `A2 (左右切换）`、`皮肤[桃夭灼灼]-原版切换…`
 * 第二种是 2026-08-10 那批老记录的写法（`今汐皮肤[桃夭灼灼]-…` → `皮肤[桃夭灼灼]-…`），
 * 说明当年的导入就是**宽松地**把开头的角色名切掉 —— 因此这里也不要求角色名后面
 * 必须跟分隔符，与 fill-placeholder-images.mjs 的 resolveTitle 保持同一口径。
 *
 * 3. 再退一步：去掉尾部重名后缀的名字（源图叫 `xx (2).png` 而库里是 `xx`）。
 *
 * 全剥光（base 就等于角色名）时不产出空串候选：空 title 会命中一片无关的行。
 */
export function titleCandidates(character, base) {
  const c = String(character ?? "");
  const b = String(base ?? "").trim();
  const out = [];
  const push = (t) => {
    if (t && !out.includes(t)) out.push(t);
  };

  push(b);
  if (c && b.startsWith(c)) {
    push(b.slice(c.length).replace(/^[\s\-－—_]+/, "").trim());
  }
  push(stripRenameSuffix(b));
  if (c && b.startsWith(c)) {
    push(stripRenameSuffix(b.slice(c.length).replace(/^[\s\-－—_]+/, "").trim()));
  }
  return out;
}

/** Map<title, row[]> —— 一次建好，逐张图 O(1) 查 */
export function buildTitleIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    if (!index.has(row.title)) index.set(row.title, []);
    index.get(row.title).push(row);
  }
  return index;
}

/**
 * 在索引里找**唯一**命中。
 *
 * 返回三种状态之一：
 *   { status: "ok", row, title }   —— 恰好一条，可以动
 *   { status: "none" }             —— 一条都没有（源图不属于本站任何一行）
 *   { status: "ambiguous", hits }  —— 命中 ≥2 条（含两个候选各命中一条的情况）
 *
 * ambiguous 单独成一类而不是取第一条：多个候选都命中说明库内确实有多行同名记录
 * （不同日期重复导入、或重名后缀与原名同时存在），此时猜错就是把图挂到另一个版本上。
 */
export function matchRow(index, character, base) {
  const hits = [];
  for (const title of titleCandidates(character, base)) {
    for (const row of index.get(title) ?? []) hits.push({ title, row });
  }
  if (hits.length === 0) return { status: "none" };
  if (hits.length === 1) return { status: "ok", row: hits[0].row, title: hits[0].title };
  return { status: "ambiguous", hits };
}
