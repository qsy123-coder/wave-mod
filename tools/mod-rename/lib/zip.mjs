/**
 * 最小 ZIP 读写（只做这个工具需要的事）：列目录、按条目复制、支持 ZIP64。
 *
 * 为什么不引库：CLAUDE.md 不允许为工具引入项目没用的依赖；而这里只需要
 * 「把源 zip 里的字节原样搬到新 zip」——不解压、不重压缩，搬运即可。
 * 压缩方法、CRC、时间戳全部沿用源条目的中央目录记录，所以：
 *   - 速度是纯 I/O（2 GB 包几秒钟），
 *   - 产物与源包逐字节等价（同样的压缩数据），体积不涨。
 *
 * 支持：STORE / DEFLATE（只搬运，不解码）、UTF-8 文件名（flag bit 11）、ZIP64 扩展。
 */
import { closeSync, openSync, readSync, statSync, writeSync } from "node:fs";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const U32_MAX = 0xffffffff;

function readAt(fd, position, length) {
  const buf = Buffer.alloc(length);
  const n = readSync(fd, buf, 0, length, position);
  return n === length ? buf : buf.subarray(0, n);
}

/** 从 EOCD（含 ZIP64）读出中央目录位置 */
function readEndRecord(fd, fileSize) {
  const tailLen = Math.min(fileSize, 66_000);
  const tailStart = fileSize - tailLen;
  const tail = readAt(fd, tailStart, tailLen);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是有效的 zip（找不到 EOCD）");

  const totalEntries = tail.readUInt16LE(eocd + 10);
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);

  if (cdOffset === U32_MAX || cdSize === U32_MAX || totalEntries === 0xffff) {
    // ZIP64：EOCD 前面是 locator，locator 指向 ZIP64 EOCD
    const locatorAt = tailStart + eocd - 20;
    if (locatorAt < 0) throw new Error("ZIP64 locator 缺失");
    const loc = readAt(fd, locatorAt, 20);
    if (loc.readUInt32LE(0) !== SIG_ZIP64_LOCATOR) throw new Error("ZIP64 locator 签名不对");
    const z64At = Number(loc.readBigUInt64LE(8));
    const z64 = readAt(fd, z64At, 56);
    if (z64.readUInt32LE(0) !== SIG_ZIP64_EOCD) throw new Error("ZIP64 EOCD 签名不对");
    cdSize = Number(z64.readBigUInt64LE(40));
    cdOffset = Number(z64.readBigUInt64LE(48));
  }

  return { cdOffset, cdSize, totalEntries };
}

/** 解析中央目录里的 ZIP64 额外字段 */
function parseZip64Extra(extra, entry) {
  let p = 0;
  while (p + 4 <= extra.length) {
    const id = extra.readUInt16LE(p);
    const len = extra.readUInt16LE(p + 2);
    if (id === 0x0001) {
      let q = p + 4;
      const take = () => {
        const v = Number(extra.readBigUInt64LE(q));
        q += 8;
        return v;
      };
      if (entry.size === U32_MAX) entry.size = take();
      if (entry.compSize === U32_MAX) entry.compSize = take();
      if (entry.localOffset === U32_MAX) entry.localOffset = take();
      break;
    }
    p += 4 + len;
  }
  return entry;
}

/**
 * 读中央目录。
 * @returns {{name:string, method:number, crc:number, compSize:number, size:number,
 *            localOffset:number, dataOffset:number, dosTime:number, dosDate:number,
 *            externalAttr:number, isDir:boolean}[]}
 */
export function listZipEntries(zipPath) {
  const fd = openSync(zipPath, "r");
  try {
    const fileSize = statSync(zipPath).size;
    const { cdOffset, cdSize } = readEndRecord(fd, fileSize);
    const cd = readAt(fd, cdOffset, cdSize);

    const entries = [];
    let p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === SIG_CENTRAL) {
      const flags = cd.readUInt16LE(p + 8);
      const entry = {
        name: "",
        method: cd.readUInt16LE(p + 10),
        dosTime: cd.readUInt16LE(p + 12),
        dosDate: cd.readUInt16LE(p + 14),
        crc: cd.readUInt32LE(p + 16),
        compSize: cd.readUInt32LE(p + 20),
        size: cd.readUInt32LE(p + 24),
        localOffset: cd.readUInt32LE(p + 42),
        externalAttr: cd.readUInt32LE(p + 38),
      };
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const nameBuf = cd.subarray(p + 46, p + 46 + nameLen);
      // flag bit 11 = UTF-8；否则按 GBK 的可能性存在，这里只做 latin1 兜底
      entry.name = nameBuf.toString(flags & 0x800 ? "utf8" : "latin1");
      parseZip64Extra(cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen), entry);

      // 本地头的名字/扩展长度可能和中央目录不同，dataOffset 必须从本地头算
      const local = readAt(fd, entry.localOffset, 30);
      if (local.readUInt32LE(0) !== SIG_LOCAL) throw new Error(`本地头签名不对：${entry.name}`);
      const localNameLen = local.readUInt16LE(26);
      const localExtraLen = local.readUInt16LE(28);
      entry.dataOffset = entry.localOffset + 30 + localNameLen + localExtraLen;
      entry.isDir = entry.name.endsWith("/");
      entries.push(entry);

      p += 46 + nameLen + extraLen + commentLen;
    }
    return { entries, fileSize };
  } finally {
    closeSync(fd);
  }
}

function writeAll(fd, buf) {
  let off = 0;
  while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
}

function nameBytes(name) {
  const buf = Buffer.from(name, "utf8");
  const ascii = /^[\x20-\x7e]*$/.test(name);
  return { buf, utf8Flag: ascii ? 0 : 0x800 };
}

/**
 * 从源 zip 里挑一部分条目，原样（压缩数据不变）写进新 zip。
 *
 * @param {string} srcPath
 * @param {object[]} selected listZipEntries() 里挑出来的条目
 * @param {string} outPath
 * @param {(entry:object)=>string} rename 返回新条目名；返回空串表示跳过
 * @returns {{written:number, bytes:number}}
 */
export function copyEntriesToZip(srcPath, selected, outPath, rename) {
  const srcFd = openSync(srcPath, "r");
  const outFd = openSync(outPath, "w");
  const central = [];
  let offset = 0;
  let written = 0;
  let bytes = 0;

  try {
    for (const entry of selected) {
      const newName = rename(entry);
      if (!newName) continue;
      const { buf: nb, utf8Flag } = nameBytes(newName);
      const needZip64 = entry.compSize >= U32_MAX || entry.size >= U32_MAX || offset >= U32_MAX;

      const localExtra = needZip64 ? Buffer.alloc(4 + 16) : Buffer.alloc(0);
      if (needZip64) {
        localExtra.writeUInt16LE(0x0001, 0);
        localExtra.writeUInt16LE(16, 2);
        localExtra.writeBigUInt64LE(BigInt(entry.size), 4);
        localExtra.writeBigUInt64LE(BigInt(entry.compSize), 12);
      }

      const local = Buffer.alloc(30);
      local.writeUInt32LE(SIG_LOCAL, 0);
      local.writeUInt16LE(needZip64 ? 45 : 20, 4);
      local.writeUInt16LE(utf8Flag, 6);
      local.writeUInt16LE(entry.method, 8);
      local.writeUInt16LE(entry.dosTime, 10);
      local.writeUInt16LE(entry.dosDate, 12);
      local.writeUInt32LE(entry.crc, 14);
      local.writeUInt32LE(needZip64 ? U32_MAX : entry.compSize, 18);
      local.writeUInt32LE(needZip64 ? U32_MAX : entry.size, 22);
      local.writeUInt16LE(nb.length, 26);
      local.writeUInt16LE(localExtra.length, 28);

      writeAll(outFd, Buffer.concat([local, nb, localExtra]));
      offset += local.length + nb.length + localExtra.length;

      // 原始压缩数据：不解压、不重压
      let remaining = entry.compSize;
      let pos = entry.dataOffset;
      const chunk = Buffer.alloc(Math.min(8 * 1024 * 1024, Math.max(1, remaining)));
      while (remaining > 0) {
        const n = readSync(srcFd, chunk, 0, Math.min(chunk.length, remaining), pos);
        if (n <= 0) throw new Error(`读取源数据失败：${entry.name}`);
        writeAll(outFd, chunk.subarray(0, n));
        pos += n;
        remaining -= n;
      }
      offset += entry.compSize;

      central.push({ entry, newName: nb, utf8Flag, offset: offset - entry.compSize - local.length - nb.length - localExtra.length, needZip64 });
      written++;
      bytes += entry.size;
    }

    // 中央目录
    const cdStart = offset;
    for (const c of central) {
      const { entry } = c;
      const extra = c.needZip64 ? Buffer.alloc(4 + 24) : Buffer.alloc(0);
      if (c.needZip64) {
        extra.writeUInt16LE(0x0001, 0);
        extra.writeUInt16LE(24, 2);
        extra.writeBigUInt64LE(BigInt(entry.size), 4);
        extra.writeBigUInt64LE(BigInt(entry.compSize), 12);
        extra.writeBigUInt64LE(BigInt(c.offset), 20);
      }
      const h = Buffer.alloc(46);
      h.writeUInt32LE(SIG_CENTRAL, 0);
      h.writeUInt16LE(0x031e, 4); // made by: unix + 3.0
      h.writeUInt16LE(c.needZip64 ? 45 : 20, 6);
      h.writeUInt16LE(c.utf8Flag, 8);
      h.writeUInt16LE(entry.method, 10);
      h.writeUInt16LE(entry.dosTime, 12);
      h.writeUInt16LE(entry.dosDate, 14);
      h.writeUInt32LE(entry.crc, 16);
      h.writeUInt32LE(c.needZip64 ? U32_MAX : entry.compSize, 20);
      h.writeUInt32LE(c.needZip64 ? U32_MAX : entry.size, 24);
      h.writeUInt16LE(c.newName.length, 28);
      h.writeUInt16LE(extra.length, 30);
      h.writeUInt16LE(0, 32);
      h.writeUInt16LE(0, 34);
      h.writeUInt16LE(0, 36);
      h.writeUInt32LE(entry.externalAttr >>> 0, 38);
      h.writeUInt32LE(c.needZip64 ? U32_MAX : c.offset, 42);
      const rec = Buffer.concat([h, c.newName, extra]);
      writeAll(outFd, rec);
      offset += rec.length;
    }
    const cdSize = offset - cdStart;

    const needZip64End = central.length > 0xffff || cdStart >= U32_MAX || cdSize >= U32_MAX;
    if (needZip64End) {
      const z64 = Buffer.alloc(56);
      z64.writeUInt32LE(SIG_ZIP64_EOCD, 0);
      z64.writeBigUInt64LE(BigInt(44), 4);
      z64.writeUInt16LE(0x031e, 12);
      z64.writeUInt16LE(45, 14);
      z64.writeUInt32LE(0, 16);
      z64.writeUInt32LE(0, 20);
      z64.writeBigUInt64LE(BigInt(central.length), 24);
      z64.writeBigUInt64LE(BigInt(central.length), 32);
      z64.writeBigUInt64LE(BigInt(cdSize), 40);
      z64.writeBigUInt64LE(BigInt(cdStart), 48);
      const z64At = offset;
      writeAll(outFd, z64);
      offset += z64.length;

      const loc = Buffer.alloc(20);
      loc.writeUInt32LE(SIG_ZIP64_LOCATOR, 0);
      loc.writeUInt32LE(0, 4);
      loc.writeBigUInt64LE(BigInt(z64At), 8);
      loc.writeUInt32LE(1, 16);
      writeAll(outFd, loc);
      offset += loc.length;
    }

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(SIG_EOCD, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(Math.min(central.length, 0xffff), 8);
    eocd.writeUInt16LE(Math.min(central.length, 0xffff), 10);
    eocd.writeUInt32LE(needZip64End ? U32_MAX : cdSize, 12);
    eocd.writeUInt32LE(needZip64End ? U32_MAX : cdStart, 16);
    eocd.writeUInt16LE(0, 20);
    writeAll(outFd, eocd);

    return { written, bytes };
  } finally {
    closeSync(srcFd);
    closeSync(outFd);
  }
}
