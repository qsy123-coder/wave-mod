import { describe, expect, it } from "vitest";

import { aiConfig, inspectResult, needsAi, sanitizeResult, suggestWithModel } from "./ai.mjs";

const glossary = {
  characters: { 금희: "今汐" },
  words: { 팬스좌: "粉丝福利" },
  categories: {},
  properNames: { "Ramielle Dan": "蕾米埃尔·丹" },
};
const known = new Set(["今汐", "吟霖", "锁暝", "玄翎"]);

function fakeFetch(payload, { status = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: status === 200,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };
  impl.calls = calls;
  return impl;
}

const items = [{ name: "x.zip", base: "어흐의별자리", meta: null }];

describe("suggestWithModel", () => {
  it("没有 key 时直接报错，不发请求", async () => {
    const f = fakeFetch({});
    const res = await suggestWithModel({ items, glossary, knownCharacters: known, config: { key: "", timeoutMs: 1000 }, fetchImpl: f });
    expect(res.errors.join()).toMatch(/DEEPSEEK_API_KEY/);
    expect(f.calls).toHaveLength(0);
  });

  it("正常返回：按 key 对上，角色必须在白名单里", async () => {
    const f = fakeFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [{ key: "x.zip", characters: ["今汐", "吟霖"], name: "粉丝福利UHD", hotkeys: "890", author: "문지기" }],
            }),
          },
        },
      ],
    });
    const res = await suggestWithModel({
      items,
      glossary,
      knownCharacters: known,
      config: { key: "k", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", timeoutMs: 1000 },
      fetchImpl: f,
    });
    expect(res.errors).toEqual([]);
    expect(res.results["x.zip"]).toEqual({
      characters: ["今汐", "吟霖"],
      name: "粉丝福利UHD",
      hotkeys: "890",
      author: "문지기",
    });

    // 请求本身：json 模式 + 提示词里带角色白名单
    const body = f.calls[0].body;
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content).toContain("今汐");
    expect(body.messages[0].content.toLowerCase()).toContain("json");
  });

  it("模型编了库里没有的角色 → 这条作废，不污染分类", async () => {
    const f = fakeFetch({
      choices: [{ message: { content: JSON.stringify({ results: [{ key: "x.zip", characters: ["卡梅莉亚"], name: "粉丝福利" }] }) } }],
    });
    const res = await suggestWithModel({
      items,
      glossary,
      knownCharacters: known,
      config: { key: "k", timeoutMs: 1000 },
      fetchImpl: f,
    });
    expect(res.results).toEqual({});
  });

  it("空内容（JSON 模式常见）→ 报错但不抛异常", async () => {
    const f = fakeFetch({ choices: [{ message: { content: "   " } }] });
    const res = await suggestWithModel({
      items,
      glossary,
      knownCharacters: known,
      config: { key: "k", timeoutMs: 1000 },
      fetchImpl: f,
    });
    expect(res.results).toEqual({});
    expect(res.errors.join()).toMatch(/空内容/);
  });

  it("接口 500 → 记录错误", async () => {
    const f = fakeFetch({ error: "boom" }, { status: 500 });
    const res = await suggestWithModel({
      items,
      glossary,
      knownCharacters: known,
      config: { key: "k", timeoutMs: 1000 },
      fetchImpl: f,
    });
    expect(res.errors.join()).toMatch(/500/);
  });
});

describe("辅助", () => {
  it("sanitizeResult 拒全空/非白名单，但单边结果照样落地", () => {
    expect(sanitizeResult({ characters: [], name: "" }, known)).toBeNull();
    expect(sanitizeResult({ characters: ["今汐", "路人甲"], name: "x" }, known)).toBeNull();
    // 全英文标题常常只给得出角色（`Shen QingXiao` → 清宵，名称空）：
    // 角色这半边必须留下，否则用户看到的就是「AI 什么都没做」
    expect(sanitizeResult({ characters: ["今汐"], name: "" }, known)).toEqual({
      characters: ["今汐"],
      name: "",
      hotkeys: "",
      author: "",
    });
    expect(sanitizeResult({ characters: [], name: "红黑" }, known)).toMatchObject({ characters: [], name: "红黑" });
    expect(sanitizeResult({ characters: ["今汐"], name: "x" }, known)).toMatchObject({ characters: ["今汐"], name: "x" });
  });

  it("inspectResult 说出每条失败的原因，而不是静默丢弃", () => {
    expect(inspectResult({ characters: ["卡梅莉亚"], name: "x" }, known).reason).toMatch(/不在库内清单/);
    expect(inspectResult({ characters: [], name: "" }, known).reason).toMatch(/没认出/);
  });

  it("needsAi：认不出角色 / 残留韩文 / 整段英文 都要问", () => {
    expect(needsAi({ characters: [], confidence: "high" })).toBe(true);
    expect(needsAi({ characters: ["心月狐"], name: "의 별자리", confidence: "low" })).toBe(true);
    // 2026-11-01 用户指出的情况：GameBanana 的「Suoming Red and Black」整段英文，也该翻
    expect(needsAi({ characters: ["锁暝"], name: "Suoming Red and Black", confidence: "high" })).toBe(true);
  });

  it("needsAi：带汉字的名字不打扰（拉丁字母多半是专名）", () => {
    expect(needsAi({ characters: ["女漂"], name: "特工RoverF（星火永明）", confidence: "high" })).toBe(false);
    expect(needsAi({ characters: ["锁暝"], name: "特效颜色更改", confidence: "high" })).toBe(false);
  });

  it("sanitizeResult 不采用照抄回来的韩文名称（角色仍保留）", () => {
    expect(sanitizeResult({ characters: ["今汐"], name: "의 별자리" }, known)).toMatchObject({
      characters: ["今汐"],
      name: "",
    });
    expect(sanitizeResult({ characters: [], name: "의 별자리" }, known)).toBeNull();
  });

  it("词表已定角色时，模型给的角色一律让位（玄翎 不被改成 秧秧）", async () => {
    const f = fakeFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [{ key: "x.zip", characters: ["今汐"], name: "SP 蕾米埃尔·丹（ZZZ）" }],
            }),
          },
        },
      ],
    });
    const res = await suggestWithModel({
      items: [{ name: "x.zip", base: "Yangyang SP as Ramielle Dan(ZZZ)", meta: null, characters: ["玄翎"] }],
      glossary,
      knownCharacters: known,
      config: { key: "k", timeoutMs: 1000 },
      fetchImpl: f,
    });
    expect(res.results["x.zip"].characters).toEqual(["玄翎"]);
    expect(res.results["x.zip"].name).toBe("SP 蕾米埃尔·丹（ZZZ）");

    // 提示词里也带上了角色提示，模型不用猜
    const body = f.calls[0].body;
    expect(body.messages[1].content).toContain('"characterHint":"玄翎"');
    expect(body.messages[0].content).toContain("characterHint");
  });

  it("原文整段英文、模型却把名称照抄回来 → 判失败并点名", async () => {
    const f = fakeFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [{ key: "y.rar", characters: ["玄翎"], name: "SP Ramielle Dan(ZZZ)" }],
            }),
          },
        },
      ],
    });
    const res = await suggestWithModel({
      items: [
        {
          name: "y.rar",
          base: "Yangyang SP as Ramielle Dan(ZZZ)",
          meta: null,
          characters: ["玄翎"],
        },
      ],
      glossary,
      knownCharacters: known,
      config: { key: "k", timeoutMs: 1000 },
      fetchImpl: f,
    });
    expect(res.results).toEqual({});
    expect(res.errors.join()).toContain("没翻成中文");
    // 提示词里带上了专有名词译名表
    expect(f.calls[0].body.messages[0].content).toContain("蕾米埃尔·丹");
  });

  it("没角色、名称原样抄回时算失败（不假装补好了）", async () => {
    const f = fakeFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [{ key: "WWGF_PACK 1", characters: [], name: "WWGF_PACK 1" }],
            }),
          },
        },
      ],
    });
    const res = await suggestWithModel({
      items: [{ name: "WWGF_PACK 1", base: "WWGF_PACK 1", meta: null }],
      glossary,
      knownCharacters: known,
      config: { key: "k", timeoutMs: 1000 },
      fetchImpl: f,
    });
    expect(res.results).toEqual({});
    expect(res.errors.join()).toContain("没认出库内角色");
  });

  it("模型漏返回某条时，错误里点名该条", async () => {
    const f = fakeFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [{ key: "x.zip", characters: ["今汐"], name: "粉丝福利" }],
            }),
          },
        },
      ],
    });
    const two = [...items, { name: "y.zip", base: "Suoming Red and Black", meta: null }];
    const res = await suggestWithModel({
      items: two,
      glossary,
      knownCharacters: known,
      config: { key: "k", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", timeoutMs: 1000 },
      fetchImpl: f,
    });
    expect(res.results["x.zip"]).toBeTruthy();
    expect(res.errors.join()).toContain("y.zip");
  });

  it("aiConfig 读环境变量并给默认值", () => {
    const c = aiConfig({ DEEPSEEK_API_KEY: " k ", DEEPSEEK_MODEL: "deepseek-chat" });
    expect(c.key).toBe("k");
    expect(c.baseUrl).toBe("https://api.deepseek.com");
    expect(c.model).toBe("deepseek-chat");
  });
});
