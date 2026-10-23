/**
 * 手写 zip 的单测。
 *
 * 失败模式是静默的：结构写错时页面照样弹「已导出」，用户解压那一刻才发现文件坏了
 * —— 而那时候几十张图的打码结果已经丢了。所以这里把产物按 zip 规范**读回来**逐项核对。
 */
import { describe, expect, it } from "vitest";

import { buildZip, crc32, type ZipEntry } from "./zip";

const DECODER = new TextDecoder();

async function bytesOf(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

type ParsedEntry = { name: string; data: Uint8Array; method: number; crc: number };

/** 按 zip 规范从尾部 EOCD 开始解析（只支持无注释、单盘） */
function parseZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("找不到 EOCD");

  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (cdOffset + cdSize !== eocd) throw new Error("中央目录尺寸与偏移对不上");

  const entries: ParsedEntry[] = [];
  let cursor = cdOffset;

  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error(`第 ${i} 条中央目录头签名不对`);
    const crc = view.getUint32(cursor + 16, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = DECODER.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen));

    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`${name} 的局部头签名不对`);
    const method = view.getUint16(localOffset + 8, true);
    const localCrc = view.getUint32(localOffset + 14, true);
    const size = view.getUint32(localOffset + 22, true);
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(dataStart, dataStart + size);

    if (localCrc !== crc) throw new Error(`${name} 的局部头与中央目录 CRC 不一致`);

    entries.push({ name, data, method, crc });
    cursor += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

describe("crc32", () => {
  it("与公开的校验值一致", () => {
    expect(crc32(new Uint8Array([0x31, 0x32, 0x33, 0x34]))).toBe(0x9be3e0a3); // "1234"
  });
});

describe("buildZip", () => {
  const entryA: ZipEntry = { name: "preview-blur.webp", data: new Uint8Array([1, 2, 3, 4, 5]) };
  const entryB: ZipEntry = {
    name: "珂莱塔-花阴-blur.webp",
    data: new Uint8Array([9, 9, 9, 9, 9, 9, 9]),
  };

  it("两条都能原样读回（含中文文件名）", async () => {
    const bytes = await bytesOf(buildZip([entryA, entryB]));
    const entries = parseZip(bytes);

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.name)).toEqual([entryA.name, entryB.name]);
    expect(Array.from(entries[0].data)).toEqual([1, 2, 3, 4, 5]);
    expect(Array.from(entries[1].data)).toEqual([9, 9, 9, 9, 9, 9, 9]);
  });

  it("用的是 STORE（method = 0），不做二次压缩", async () => {
    const bytes = await bytesOf(buildZip([entryA]));
    expect(parseZip(bytes)[0].method).toBe(0);
  });

  it("CRC 与内容对得上", async () => {
    const bytes = await bytesOf(buildZip([entryA]));
    expect(parseZip(bytes)[0].crc).toBe(crc32(entryA.data));
  });

  it("空清单也能产出合法的空 zip", async () => {
    const bytes = await bytesOf(buildZip([]));
    expect(parseZip(bytes)).toHaveLength(0);
  });

  it("多条之间不串数据（局部头偏移正确）", async () => {
    const entries = [1, 2, 3, 4, 5].map((n) => ({
      name: `img-${n}.webp`,
      data: new Uint8Array([n, n, n]),
    }));
    const parsed = parseZip(await bytesOf(buildZip(entries)));
    expect(parsed.map((e) => Array.from(e.data))).toEqual(entries.map((e) => [e.data[0], e.data[0], e.data[0]]));
  });
});
