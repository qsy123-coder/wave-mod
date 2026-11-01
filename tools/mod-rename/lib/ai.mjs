/**
 * 模型兜底：词表没命中时，让 DeepSeek 给出「角色 + 中文名」的建议。
 *
 * 为什么是 DeepSeek：用户只有它的 key。接口是 OpenAI 兼容的 /chat/completions，
 * 所以直接 fetch 即可 —— 不引任何 SDK，也就不违反「不为工具加项目没用的依赖」。
 *
 * 三条纪律：
 *   1. **词表优先**：这里只处理词表没搞定的条目，命中词表的永远不问模型；
 *   2. **角色白名单**：模型返回的角色必须落在库内 distinct 里，否则整条判失败 ——
 *      角色写错会在前台凭空多一个分类，而且不报错；
 *   3. **失败不阻塞**：超时/空回复/JSON 坏了都只返回错误，页面照常能人工填。
 */

const DEFAULT_BASE = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const MAX_ITEMS = 25;

export function aiConfig(env = process.env) {
  return {
    key: env.DEEPSEEK_API_KEY?.trim() || "",
    baseUrl: (env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, ""),
    model: env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: Number(env.DEEPSEEK_TIMEOUT_MS) || 25_000,
  };
}

const HANGUL = /[가-힣]/;
const CJK = /[一-鿿]/;
const LATIN = /[A-Za-z]/;

/**
 * 这条要不要问模型。三种情况：
 *   1. 没认出角色；
 *   2. 名称里还有韩文没翻（`의 별자리`）；
 *   3. 名称**整段是英文、一个汉字都没有**（`Suoming Red and Black`）——
 *      带汉字的（`特工RoverF（星火永明）`）不算，那里的拉丁字母通常是专名，翻了反而错。
 */
export function needsAi(suggestion) {
  if (!suggestion) return true;
  if (!(suggestion.characters ?? []).length) return true;
  const name = String(suggestion.name ?? "");
  if (HANGUL.test(name)) return true;
  if (!CJK.test(name) && LATIN.test(name)) return true;
  return false;
}

function buildSystemPrompt(glossary, characters) {
  const whitelist = characters.join("、");
  const dict = {
    characters: glossary.characters ?? {},
    words: glossary.words ?? {},
    categories: glossary.categories ?? {},
  };
  return [
    "你是《鸣潮》Mod 站的内容整理员，把韩语/英文的 Mod 标题整理成站内命名。",
    "",
    "只输出 json，形如：",
    '{"results":[{"key":"<原样返回的 key>","characters":["角色"],"name":"中文名称","hotkeys":"","author":""}]}',
    "",
    "规则：",
    `1. characters 只能从这个清单里选，禁止发明新角色：${whitelist}`,
    "2. name 是去掉角色名之后的皮肤/风格名；保留版本号与括号内容；不要重复角色名。",
    "2b. name 必须是中文：原文里残留的韩文（例如「의 별자리」）也要翻译，禁止照抄韩文。",
    "3. hotkeys 只填切换键（例如 ctrl+alt、890上下左右、num1~7），没有就空串。",
    "4. author 填作者名；原文没有就空串。",
    "4b. 专有名词保留原文：武器型号、作品名、人名昵称（如 OTs-14 Groza、Sol Badguy、M4 SOPMOD II、RoverF）不要翻成中文；",
    "    只翻译描述性词语（颜色、服饰类型、风格，如 Red and Black → 红黑）。",
    "5. 一个条目里有多个角色时，characters 按出现顺序全部列出。",
    "6. 拿不准就把 characters 留空数组，不要猜。",
    "",
    "韩语→中文对照（优先使用）：",
    JSON.stringify(dict),
  ].join("\n");
}

function buildUserPrompt(items) {
  const payload = {
    items: items.map((it) => ({
      key: it.name,
      raw: it.base,
      author: it.meta?.author ?? "",
      category: it.meta?.subcategory ?? "",
    })),
  };
  return `把这些条目整理成规范名，返回 json：\n${JSON.stringify(payload)}`;
}

/** 把模型给的结果裁到合法范围：角色必须在白名单里，否则整条作废 */
export function sanitizeResult(raw, whitelist) {
  if (!raw || typeof raw !== "object") return null;
  const characters = Array.isArray(raw.characters)
    ? [...new Set(raw.characters.map((c) => String(c).trim()).filter(Boolean))]
    : [];
  const bad = characters.filter((c) => !whitelist.has(c));
  if (bad.length) return null; // 只要有一个不在库里，这条就不能用
  const name = String(raw.name ?? "").trim();
  if (!characters.length || !name) return null;
  if (HANGUL.test(name)) return null; // 要求翻译却照抄韩文 ⇒ 当失败，别让它假装补好了
  return {
    characters,
    name,
    hotkeys: String(raw.hotkeys ?? "").trim(),
    author: String(raw.author ?? "").trim(),
  };
}

/**
 * 调一次模型（内部按 25 条分批）。
 * @returns {Promise<{results:Record<string,object>, errors:string[]}>}
 */
export async function suggestWithModel({ items, glossary, knownCharacters, config = aiConfig(), fetchImpl = fetch }) {
  const results = {};
  const errors = [];
  if (!config.key) {
    return { results, errors: ["没有配置 DEEPSEEK_API_KEY（本机 .env.local）"] };
  }
  const whitelist = new Set(knownCharacters ?? []);
  if (!whitelist.size) {
    return { results, errors: ["拿不到库内角色清单，模型建议无法校验，已跳过"] };
  }

  for (let i = 0; i < items.length; i += MAX_ITEMS) {
    const batch = items.slice(i, i + MAX_ITEMS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.key}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          max_tokens: 2000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: buildSystemPrompt(glossary, [...whitelist]) },
            { role: "user", content: buildUserPrompt(batch) },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        errors.push(`模型接口 ${res.status}：${text.slice(0, 200)}`);
        continue;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) {
        // DeepSeek 的 JSON 模式在「不是 json」时会把内容替换成空格，这里当失败处理
        errors.push("模型返回空内容（可能没按 json 输出）");
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        errors.push(`模型返回的不是 json：${content.slice(0, 120)}`);
        continue;
      }
      const list = Array.isArray(parsed?.results) ? parsed.results : [];
      batch.forEach((it, idx) => {
        const hit = list.find((r) => r?.key === it.name) ?? list[idx];
        const clean = sanitizeResult(hit, whitelist);
        if (clean) results[it.name] = clean;
      });
    } catch (err) {
      const msg = err?.name === "AbortError" ? `模型超时（>${config.timeoutMs}ms）` : String(err?.message ?? err);
      errors.push(msg);
    } finally {
      clearTimeout(timer);
    }
  }

  return { results, errors };
}
