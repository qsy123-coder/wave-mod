import { describe, expect, it } from "vitest";

import {
  MOD_GROUPS_VERSION,
  applyPostVariantLabels,
  deriveVariantLabel,
  matchRecordsToGroups,
  mergeModGroups,
  normalizeGameBananaUrl,
  normalizeGroupKey,
  uniqueVariantLabel,
} from "./mod-groups-pure.mjs";

describe("normalizeGameBananaUrl", () => {
  it("canonicalizes GameBanana mod URLs", () => {
    expect(normalizeGameBananaUrl("https://gamebanana.com/mods/626205")).toBe("https://gamebanana.com/mods/626205");
    expect(normalizeGameBananaUrl("gamebanana.com/mods/626205/?tab=files")).toBe("https://gamebanana.com/mods/626205");
    expect(normalizeGameBananaUrl("https://www.gamebanana.com/mods/626205")).toBe("https://gamebanana.com/mods/626205");
  });

  it("rejects non-mod or non-GameBanana URLs", () => {
    expect(normalizeGameBananaUrl("https://arca.live/b/wutheringwaves/123")).toBeNull();
    expect(normalizeGameBananaUrl("https://gamebanana.com/skins/626205")).toBeNull();
    expect(normalizeGameBananaUrl("")).toBeNull();
  });
});

describe("normalizeGroupKey", () => {
  it("normalizes share names across rename states", () => {
    expect(normalizeGroupKey("奥古斯塔-Champion of Sunlight（Slim SFW）by Alunoop3D.exe")).toBe(
      "奥古斯塔-champion of sunlight(slim sfw)by alunoop3d",
    );
    expect(normalizeGroupKey("X (1).zip")).toBe("x");
    expect(normalizeGroupKey("X_1.zip")).toBe("x");
  });
});

describe("deriveVariantLabel", () => {
  it("keeps the full descriptor after removing the post title", () => {
    expect(deriveVariantLabel("Augusta Champion of Sunlight Slim SFW.zip", "Augusta Champion of Sunlight")).toBe("Slim SFW");
    expect(
      deriveVariantLabel("Moonlight Mirage Mornye Thicc Heavy NSFW VIP.zip", "Moonlight Mirage Mornye", "Alunoop3D"),
    ).toBe("Thicc Heavy NSFW VIP");
  });

  it("handles GameBanana's lowercase underscore names and trailing hash ids", () => {
    expect(
      deriveVariantLabel("augusta_champion_of_sunlight_slim_sfw_8e1ec.zip", "Augusta Champion of Sunlight"),
    ).toBe("Slim SFW");
    expect(
      deriveVariantLabel(
        "moonlight_mirage_mornye_thicc_heavy_nsfw_vip_c82f6.zip",
        "Moonlight Mirage Mornye",
      ),
    ).toBe("Thicc Heavy NSFW VIP");
  });

  it("does not treat ordinary hex-looking words as a hash", () => {
    expect(deriveVariantLabel("X added.zip", "X")).toBe("Added");
  });

  it("falls back to the known variant vocabulary", () => {
    expect(deriveVariantLabel("Something_NSFW.7z", "Something")).toBe("NSFW");
  });

  it("returns an empty string when nothing remains", () => {
    expect(deriveVariantLabel("X.zip", "X")).toBe("");
    expect(deriveVariantLabel("X (1).zip", "X")).toBe("");
  });
});

describe("applyPostVariantLabels", () => {
  it("labels every row of the same post, including the base row", () => {
    const rows = [
      {
        name: "Augusta_1.zip",
        src: "Augusta Champion of Sunlight Slim SFW.zip",
        url: "https://gamebanana.com/mods/626205",
        title: "Champion of Sunlight by Alunoop3D",
        postTitle: "Augusta Champion of Sunlight",
        author: "Alunoop3D",
        applicable: true,
        changed: 1,
      },
      {
        name: "Augusta_2.zip",
        src: "Augusta Champion of Sunlight Thicc NSFW.zip",
        url: "https://gamebanana.com/mods/626205",
        title: "Champion of Sunlight（Thicc NSFW）by Alunoop3D",
        postTitle: "Augusta Champion of Sunlight",
        author: "Alunoop3D",
        applicable: true,
        changed: 1,
      },
    ];

    applyPostVariantLabels(rows);

    expect(rows.map((row) => row.variantLabel)).toEqual(["Slim SFW", "Thicc NSFW"]);
    expect(rows[0].isBaseVariant).toBe(true);
    expect(rows[1].isBaseVariant).toBe(false);
    expect(rows[0].postUrl).toBe("https://gamebanana.com/mods/626205");
    expect(rows[0].groupTitle).toBe("Champion of Sunlight by Alunoop3D");
  });

  it("ignores single-row posts and non-GameBanana sources", () => {
    const single = [{ name: "a.zip", url: "https://gamebanana.com/mods/1", title: "A", applicable: true, changed: 1 }];
    applyPostVariantLabels(single);
    expect(single[0].variantLabel).toBeUndefined();

    const arca = [
      { name: "a.zip", url: "https://arca.live/b/x/1", title: "A" },
      { name: "b.zip", url: "https://arca.live/b/x/1", title: "A" },
    ];
    applyPostVariantLabels(arca);
    expect(arca.every((row) => row.variantLabel === undefined)).toBe(true);
  });

  it("makes duplicate labels unique", () => {
    const used = new Set();
    expect(uniqueVariantLabel("SFW", used)).toBe("SFW");
    expect(uniqueVariantLabel("SFW", used)).toBe("SFW #2");
  });
});

describe("mergeModGroups", () => {
  const incoming = [
    {
      postUrl: "https://gamebanana.com/mods/626205",
      variants: [
        {
          label: "Slim SFW",
          name: "奥古斯塔-Champion of Sunlight（Slim SFW）by Alunoop3D",
          localName: "奥古斯塔-Champion of Sunlight_1 by Alunoop3D.zip",
          sourceName: "Augusta Champion of Sunlight Slim SFW.zip",
          isBase: false,
        },
        {
          label: "Slim NSFW",
          name: "奥古斯塔-Champion of Sunlight（Slim NSFW）by Alunoop3D",
          sourceName: "Augusta Champion of Sunlight Slim NSFW.zip",
          isBase: false,
        },
        {
          label: "Thicc SFW",
          name: "奥古斯塔-Champion of Sunlight（Thicc SFW）by Alunoop3D",
          sourceName: "Augusta Champion of Sunlight Thicc SFW.zip",
          isBase: true,
        },
      ],
    },
  ];

  it("parses the base character/title and keeps variants", () => {
    const manifest = mergeModGroups(null, incoming, "2026-11-11T00:00:00.000Z");

    expect(manifest.version).toBe(MOD_GROUPS_VERSION);
    expect(manifest.groups["https://gamebanana.com/mods/626205"]).toMatchObject({
      character: "奥古斯塔",
      title: "Champion of Sunlight（Thicc SFW）by Alunoop3D",
      baseName: "奥古斯塔-Champion of Sunlight（Thicc SFW）by Alunoop3D",
    });
    expect(manifest.groups["https://gamebanana.com/mods/626205"].variants).toHaveLength(3);
  });

  it("keeps previously known variants when a later batch only contains one of them", () => {
    const first = mergeModGroups(null, incoming, "2026-11-11T00:00:00.000Z");
    const second = mergeModGroups(
      first,
      [
        {
          postUrl: "https://gamebanana.com/mods/626205",
          variants: [incoming[0].variants[0], incoming[0].variants[1]],
        },
      ],
      "2026-11-12T00:00:00.000Z",
    );

    expect(second.groups["https://gamebanana.com/mods/626205"].variants).toHaveLength(3);
    // 第二批没带基行：基行必须沿用旧清单，不能把第一个新变体当基行
    expect(second.groups["https://gamebanana.com/mods/626205"].baseName).toBe(first.groups["https://gamebanana.com/mods/626205"].baseName);
    expect(second.groups["https://gamebanana.com/mods/626205"].title).toBe(first.groups["https://gamebanana.com/mods/626205"].title);
  });

  it("drops groups with fewer than two variants", () => {
    expect(mergeModGroups(null, [{ postUrl: "https://gamebanana.com/mods/1", variants: [incoming[0].variants[0]] }])).toBeNull();
  });
});

describe("matchRecordsToGroups", () => {
  const manifest = {
    version: 1,
    updatedAt: "",
    groups: {
      "https://gamebanana.com/mods/626205": {
        postUrl: "https://gamebanana.com/mods/626205",
        character: "奥古斯塔",
        title: "Champion of Sunlight by Alunoop3D",
        baseName: "奥古斯塔-Champion of Sunlight by Alunoop3D",
        variants: [
          {
            label: "Slim SFW",
            name: "奥古斯塔-Champion of Sunlight（Slim SFW）by Alunoop3D",
            localName: "奥古斯塔-Champion of Sunlight_1 by Alunoop3D",
            sourceName: "Augusta Champion of Sunlight Slim SFW",
          },
          {
            label: "Thicc NSFW",
            name: "奥古斯塔-Champion of Sunlight（Thicc NSFW）by Alunoop3D",
            localName: "奥古斯塔-Champion of Sunlight_2 by Alunoop3D",
            sourceName: "Augusta Champion of Sunlight Thicc NSFW",
          },
        ],
      },
    },
  };

  it("matches by name, localName and sourceName", () => {
    const records = [
      { key: "奥古斯塔-Champion of Sunlight（Slim SFW）by Alunoop3D", url: "https://pan.quark.cn/s/1" },
      { key: "奥古斯塔-Champion of Sunlight_2 by Alunoop3D.exe", url: "https://pan.quark.cn/s/2" },
    ];

    const result = matchRecordsToGroups(records, manifest);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].matches.map((match) => match.variant.label)).toEqual(["Slim SFW", "Thicc NSFW"]);
    expect(result.recordHits.get(records[0]).isImageSource).toBe(true);
    expect(result.recordHits.get(records[1]).isImageSource).toBe(false);
  });

  it("requires at least two distinct variants", () => {
    const records = [{ key: "奥古斯塔-Champion of Sunlight（Slim SFW）by Alunoop3D", url: "https://pan.quark.cn/s/1" }];
    const result = matchRecordsToGroups(records, manifest);

    expect(result.groups).toHaveLength(0);
    expect(result.recordHits.size).toBe(0);
    expect(result.unmatched.map((item) => item.variant.label)).toContain("Thicc NSFW");
  });

  it("returns empty structures for a missing or corrupt manifest", () => {
    expect(matchRecordsToGroups([], null)).toMatchObject({ groups: [], unmatched: [] });
    expect(matchRecordsToGroups([], { version: 99 })).toMatchObject({ groups: [] });
  });
});
