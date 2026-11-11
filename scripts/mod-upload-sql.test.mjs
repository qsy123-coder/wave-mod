import { describe, expect, it } from "vitest";

import { INSERT_COLUMNS, buildImageUpdateSql, buildInsertSql, buildMergeDriveLinksSql, buildRedateSql } from "./mod-upload-sql.mjs";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Champion of Sunlight by Alunoop3D",
  character: "奥古斯塔",
  game_key: "wuthering-waves",
  created_at: "2026-11-11T04:00:00.000Z",
};

describe("buildInsertSql", () => {
  it("keeps the original column list and NOT EXISTS guard", () => {
    const sql = buildInsertSql([row]);

    expect(INSERT_COLUMNS).toContain("drive_links");
    expect(sql).toContain("jsonb_populate_recordset(null::mods");
    expect(sql).toContain("where not exists");
    expect(sql).toContain("m.game_key = j.game_key");
    expect(sql).toContain(row.id);
  });
});

describe("buildRedateSql", () => {
  it("only updates created_at and updated_at", () => {
    const sql = buildRedateSql([{ id: row.id, createdAt: row.created_at }]);

    expect(sql).toContain("set created_at = incoming.created_at");
    expect(sql).toContain("updated_at = now()");
    expect(sql).not.toContain("drive_links");
  });
});

describe("buildImageUpdateSql", () => {
  it("only updates images for the given rows", () => {
    const sql = buildImageUpdateSql([
      { id: row.id, images: ["https://cos.test/a.webp", "https://cos.test/b.webp"] },
    ]);

    expect(sql).toContain("set images = i.images");
    expect(sql).toContain("updated_at = now()");
    expect(sql).not.toContain("drive_links");
    expect(sql).toContain("https://cos.test/a.webp");
    expect(sql).toContain(row.id);
  });
});

describe("buildMergeDriveLinksSql", () => {
  const driveLinks = [
    { platform: "夸克网盘", url: "https://pan.quark.cn/s/slim", variant: "Slim SFW" },
    { platform: "迅雷网盘", url: "https://pan.xunlei.com/s/slim", variant: "Slim SFW" },
    { platform: "夸克网盘", url: "https://pan.quark.cn/s/nsfw", variant: "Thicc NSFW" },
  ];

  it("dedupes by (variant, platform), prefers the new link, and keeps created_at monotonic", () => {
    const sql = buildMergeDriveLinksSql([{ id: row.id, createdAt: row.created_at, driveLinks }]);

    expect(sql).toContain("distinct on (coalesce(link->>'variant', ''), link->>'platform')");
    expect(sql).toContain("order by coalesce(link->>'variant', ''), link->>'platform', ord desc");
    expect(sql).toContain("created_at = greatest(m.created_at, i.created_at)");
    // 旧行里本次没出现的变体也要保留 → 两边 union + 并集聚合
    expect(sql).toContain("union all");
    expect(sql).toContain("jsonb_agg(link order by variant_key, platform_key)");
  });

  it("embeds the variant tags and URLs in the batch payload", () => {
    const sql = buildMergeDriveLinksSql([{ id: row.id, createdAt: row.created_at, driveLinks }]);

    expect(sql).toContain("Slim SFW");
    expect(sql).toContain("Thicc NSFW");
    expect(sql).toContain("https://pan.quark.cn/s/nsfw");
    expect(sql).toContain(row.id);
  });
});
