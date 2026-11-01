import { describe, expect, it } from "vitest";

import { aiConfig, needsAi, sanitizeResult, suggestWithModel } from "./ai.mjs";

const glossary = { characters: { 금희: "今汐" }, words: { 팬스좌: "粉丝福利" }, categories: {} };
const known = new Set(["今汐", "吟霖", "锁暝"]);

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
  it("sanitizeResult 拒空角色/空名称/非白名单", () => {
    expect(sanitizeResult({ characters: [], name: "x" }, known)).toBeNull();
    expect(sanitizeResult({ characters: ["今汐"], name: "" }, known)).toBeNull();
    expect(sanitizeResult({ characters: ["今汐", "路人甲"], name: "x" }, known)).toBeNull();
    expect(sanitizeResult({ characters: ["今汐"], name: "x" }, known)).toMatchObject({ characters: ["今汐"], name: "x" });
  });

  it("needsAi：认不出角色或置信度低就要问", () => {
    expect(needsAi({ characters: [], confidence: "high" })).toBe(true);
    expect(needsAi({ characters: ["今汐"], confidence: "low" })).toBe(true);
    expect(needsAi({ characters: ["今汐"], confidence: "high" })).toBe(false);
  });

  it("aiConfig 读环境变量并给默认值", () => {
    const c = aiConfig({ DEEPSEEK_API_KEY: " k ", DEEPSEEK_MODEL: "deepseek-chat" });
    expect(c.key).toBe("k");
    expect(c.baseUrl).toBe("https://api.deepseek.com");
    expect(c.model).toBe("deepseek-chat");
  });
});
