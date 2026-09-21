import { describe, expect, it } from "vitest";

import { xxmiInstallGuideText } from "@/lib/constants/install-guide";

import { mapMod, publicModColumns, publicModDetailColumns } from "./mappers";
import type { ModRow } from "./types";

// 完整的 ModRow 基线。不学 featured.test.ts 那样只写几个字段再 as 转型 ——
// 那样的对象里 `images: []` 会被推断成 never[]，而 ModRow.images 是 string[]，
// string[] 不可赋给 never[]，反而让断言转型通不过（featured.test.ts 是因为压根
// 没写 images/drive_links 才侥幸躲过）。写全就不用转型，改字段也能被编译器挡住。
const BASE_ROW: ModRow = {
  character: "今汐",
  comments_count: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  created_by: null,
  description: "描述",
  download_url: null,
  downloads_count: 0,
  drive_links: [],
  favorites_count: 0,
  featured_order: null,
  game_key: "wuthering-waves",
  game_version: "2.0",
  id: "00000000-0000-0000-0000-000000000001",
  images: [],
  is_available: true,
  is_featured: false,
  is_published: true,
  likes_count: 0,
  mod_author_url: null,
  nsfw: false,
  rating_average: 0,
  rating_count: 0,
  title: "测试 MOD",
  updated_at: "2026-01-01T00:00:00.000Z",
  version: "1.0",
  video_url: null,
  views: 0,
  xxmi_install_guide: xxmiInstallGuideText,
};

function makeRow(overrides: Partial<ModRow> = {}): ModRow {
  return { ...BASE_ROW, ...overrides };
}

// 模拟"查询里没带这一列"：类型上 ModRow 说它必填 string，运行时才会缺键，
// 这也正是 mapMod 需要 ?? 兜底的原因。
function makeRowWithoutGuide(): ModRow {
  const row = makeRow();
  delete (row as Record<string, unknown>).xxmi_install_guide;
  return row;
}

describe("publicModColumns 列清单", () => {
  // 这一条是流量优化的防回归护栏：xxmi_install_guide 占列表列集 payload 约 24%
  // （实测每次整表扫 1,384,698 字节 ≈ 1.32 MiB），而列表页根本不展示它。
  // 谁把它加回 publicModColumns，就会让每次整表扫多拉这么多 ——
  // 按当前 1 小时的缓存 TTL 算约合每月多 0.9 GB（TTL 还是 5 分钟时是 11 GB）。
  // 这里必须红。
  it("不含 xxmi_install_guide（该列占 payload 约 24% 且列表页不展示）", () => {
    expect(publicModColumns).not.toContain("xxmi_install_guide");
  });

  it("详情列清单含 xxmi_install_guide", () => {
    expect(publicModDetailColumns).toContain("xxmi_install_guide");
  });

  it("详情列清单是列表列清单的超集", () => {
    const listCols = publicModColumns.split(",").map((c) => c.trim()).filter(Boolean);
    const detailCols = new Set(publicModDetailColumns.split(",").map((c) => c.trim()));
    for (const col of listCols) {
      expect(detailCols.has(col)).toBe(true);
    }
  });
});

describe("mapMod 的安装说明回填", () => {
  // 后台可以为单个 mod 自定义安装说明（edit-mod-actions.ts 的 xxmiGuide 字段），
  // 所以行内有该列时必须用它，不能被默认常量盖掉。
  it("行内带该列时用行内值，不覆盖后台自定义", () => {
    const row = makeRow({ xxmi_install_guide: "这是后台自定义的说明。" });
    expect(mapMod(row).xxmiInstallGuide).toBe("这是后台自定义的说明。");
  });

  // 列表路径的查询已裁剪该列（见 publicModColumns），运行时缺键。
  // 类型上 ModRow 声明它是必填 string，所以这个分支只能靠运行时兜底。
  it("行内缺该列时回填默认常量（列表路径已裁剪该列）", () => {
    expect(mapMod(makeRowWithoutGuide()).xxmiInstallGuide).toBe(xxmiInstallGuideText);
  });

  it("行内该列为 null 时回填默认常量", () => {
    const row = makeRow();
    (row as Record<string, unknown>).xxmi_install_guide = null;
    expect(mapMod(row).xxmiInstallGuide).toBe(xxmiInstallGuideText);
  });

  it("回填的默认常量就是 install-guide.ts 的四行文本", () => {
    expect(mapMod(makeRowWithoutGuide()).xxmiInstallGuide.split("\n")).toHaveLength(4);
  });
});
