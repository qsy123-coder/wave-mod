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

/** 去掉 JSON 里 `_note` 这类说明键，别把注释塞进提示词 */
function withoutNotes(obj) {
  return Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => !k.startsWith("_")));
}

function buildSystemPrompt(glossary, characters) {
  const whitelist = characters.join("、");
  const dict = {
    characters: withoutNotes(glossary.characters),
    words: withoutNotes(glossary.words),
    categories: withoutNotes(glossary.categories),
    properNames: withoutNotes(glossary.properNames),
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
    "4b. 英文人名要翻成社区通用中文名，参考 properNames（Ramielle Dan → 蕾米埃尔·丹、Sol Badguy → 索尔·巴德盖、",
    "    Vergil → 维吉尔、Dante → 但丁）；只有武器型号/编号/缩写（OTs-14 Groza、M4 SOPMOD II、RoverF、ZZZ、DMC）保留原文；",
    "    颜色、服饰类型、风格等描述性词语也翻成中文（Red and Black → 红黑）。",
    "5. 一个条目里有多个角色时，characters 按出现顺序全部列出。",
    "6. 拿不准就把 characters 留空数组，不要猜。",
    "7. 全英文标题必须翻成中文：角色名换成白名单里的中文标准名，描述性文字和英文人名按 4b 翻译",
    "    （Red and Black → 红黑、simplified and minor edit → 简化与微调）。只有型号/缩写保留原文。",
    "    标题本身就是一个角色名时，name 留空串即可，不要硬造名字。",
    "8. 条目里的 characterHint 是来源站分类/词表已经定死的角色：非空时 characters 必须原样使用它，",
    "   尤其不要按标题里的英文角色名去猜（`Yangyang: Xuanling` 的条目是玄翎，不是秧秧）。",
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
      characterHint: (it.characters ?? []).join(","),
    })),
  };
  return `把这些条目整理成规范名，返回 json：\n${JSON.stringify(payload)}`;
}

/**
 * 模型给的一条结果 → 可落地部分 + 不可用原因。
 *
 * 允许「单边」结果：全英文标题常常只有一个角色名（`Shen QingXiao`），
 * 模型认出了角色却给不出名称 —— 这半边仍然值钱，填进表单让用户补名称即可。
 * 唯一硬底线是角色白名单：出现库外角色整条作废（前台会凭空多一个分类）。
 */
export function inspectResult(raw, whitelist) {
  if (!raw || typeof raw !== "object") return { result: null, reason: "模型返回的条目不是对象" };
  const characters = Array.isArray(raw.characters)
    ? [...new Set(raw.characters.map((c) => String(c).trim()).filter(Boolean))]
    : [];
  const bad = characters.filter((c) => !whitelist.has(c));
  if (bad.length) return { result: null, reason: `角色「${bad.join("、")}」不在库内清单` };

  let name = String(raw.name ?? "").trim();
  if (HANGUL.test(name)) name = ""; // 要求翻译却照抄韩文 ⇒ 名称不可用，但角色仍然保留
  if (!characters.length && !name) {
    return { result: null, reason: "模型没认出库内角色，也没给出名称" };
  }
  return {
    result: {
      characters,
      name,
      hotkeys: String(raw.hotkeys ?? "").trim(),
      author: String(raw.author ?? "").trim(),
    },
    reason: "",
  };
}

/** 兼容旧调用：只要结果，不要原因 */
export function sanitizeResult(raw, whitelist) {
  return inspectResult(raw, whitelist).result;
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
        if (!hit) {
          errors.push(`${it.name}：模型没有返回这一条`);
          return;
        }
        // 词表/分类已经定死角色时，无论模型返回什么都以词表为准（`Yangyang: Xuanling` → 玄翎）
        const hinted = it.characters?.length ? it.characters : null;
        const { result, reason } = inspectResult(hinted ? { ...hit, characters: hinted } : hit, whitelist);
        // 原文整段英文时，名称必须真的翻成中文：照抄 `Ramielle Dan` 这种等于没翻
        const rawName = String(it.base ?? it.name);
        const mustTranslate = LATIN.test(rawName) && !CJK.test(rawName);
        if (!result) {
          errors.push(`${it.name}：${reason}`);
        } else if (!result.characters.length && result.name === it.base) {
          // 没角色、名字也原样抄回（`WWGF_PACK 1`）—— 等于什么都没补，别假装成功
          errors.push(`${it.name}：模型没认出库内角色`);
        } else if (mustTranslate && result.name && !CJK.test(result.name)) {
          errors.push(`${it.name}：名称没翻成中文（${result.name}）`);
        } else {
          results[it.name] = result;
        }
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
