import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { copyEntriesToZip, listZipEntries } from "./zip.mjs";

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "zip-test-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 手写一个 STORE 模式的 zip（无外部依赖），用来验证读写两侧 */
export function makeZip(path, files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.from(f.data);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x800, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    const rec = Buffer.concat([lh, name, data]);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([ch, name]));

    locals.push(rec);
    offset += rec.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  writeFileSync(path, Buffer.concat([...locals, cd, eocd]));
}

describe("listZipEntries", () => {
  it("读出条目名、大小与数据偏移（含中文名）", () => {
    const zip = join(root, "a.zip");
    makeZip(zip, [
      { name: "今汐/贴图/身体.dds", data: "hello" },
      { name: "吟霖/mod.ini", data: "world!!" },
    ]);
    const { entries } = listZipEntries(zip);
    expect(entries.map((e) => e.name)).toEqual(["今汐/贴图/身体.dds", "吟霖/mod.ini"]);
    expect(entries[0].size).toBe(5);
    expect(entries[1].size).toBe(7);
    // dataOffset 指向的数据确实是条目内容
    const raw = readFileSync(zip);
    expect(raw.subarray(entries[0].dataOffset, entries[0].dataOffset + 5).toString()).toBe("hello");
  });
});

describe("copyEntriesToZip", () => {
  it("只搬选中的条目，可按新名字写进新包，数据不变", () => {
    const zip = join(root, "src.zip");
    const out = join(root, "out.zip");
    makeZip(zip, [
      { name: "A/x.bin", data: "AAA" },
      { name: "B/y.bin", data: "BB" },
    ]);
    const { entries } = listZipEntries(zip);
    const picked = entries.filter((e) => e.name.startsWith("A/"));
    const res = copyEntriesToZip(zip, picked, out, (e) => `新包/${e.name.slice(2)}`);

    expect(res).toEqual({ written: 1, bytes: 3 });
    const back = listZipEntries(out).entries;
    expect(back.map((e) => e.name)).toEqual(["新包/x.bin"]);
    expect(readFileSync(out).subarray(back[0].dataOffset, back[0].dataOffset + 3).toString()).toBe("AAA");
  });
});
