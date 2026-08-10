/**
 * Parse docx to map images to specific paragraph positions within each Q&A.
 */
import fs from "node:fs";
import path from "node:path";

const XML_DIR = path.join(process.env.TEMP || "/tmp", "docx_extract_v3");

const docXml = fs.readFileSync(path.join(XML_DIR, "word", "document.xml"), "utf-8");
const relsXml = fs.readFileSync(path.join(XML_DIR, "word", "_rels", "document.xml.rels"), "utf-8");

// rId -> filename
const rIdMap = {};
for (const m of relsXml.matchAll(/<Relationship[^>]*Id="(rId\d+)"[^>]*Target="media\/(image\d+\.\w+)"/g)) {
  rIdMap[m[1]] = m[2];
}

// Paragraphs
const pBlocks = docXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];

const results = [];
let currentQ = 0;
let paragraphs = []; // { type: 'text'|'image', content: string }
let sectionTitle = "";

const SECTION_PATTERNS = [
  "安装与更新", "启动与闪退", "模型与贴图",
  "Mod 加载与生效", "Mod 管理与配置", "性能与其他"
];

for (const block of pBlocks) {
  const tMatches = block.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
  let text = "";
  if (tMatches) {
    for (const t of tMatches) {
      const inner = t.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
      if (inner) text += inner[1];
    }
  }
  text = text.trim();

  // Check for section headers
  for (const pat of SECTION_PATTERNS) {
    if (text.includes(pat)) {
      sectionTitle = pat;
      break;
    }
  }

  // Check for images
  const blipMatches = block.match(/r:embed="(rId\d+)"/g);
  if (blipMatches) {
    const imgNums = [];
    for (const bm of blipMatches) {
      const rId = bm.match(/r:embed="(rId\d+)"/)?.[1];
      if (rId && rIdMap[rId] && currentQ > 0) {
        const filename = rIdMap[rId];
        const num = filename.match(/\d+/)?.[0];
        if (num) imgNums.push(num);
      }
    }
    if (imgNums.length > 0) {
      paragraphs.push({ type: "image", nums: imgNums });
    }
    continue;
  }

  // Check for Q heading
  const qMatch = text.match(/^Q(\d+)\s/);
  if (qMatch) {
    if (currentQ > 0 && paragraphs.length > 0) {
      results.push({ q: currentQ, section: sectionTitle, paragraphs: [...paragraphs] });
    }
    currentQ = parseInt(qMatch[1], 10);
    paragraphs = [{ type: "text", content: text }];
    continue;
  }

  if (text && currentQ > 0) {
    paragraphs.push({ type: "text", content: text });
  }
}

if (currentQ > 0 && paragraphs.length > 0) {
  results.push({ q: currentQ, section: sectionTitle, paragraphs: [...paragraphs] });
}

function getFile(q) {
  if (q <= 4) return "01-installation.md";
  if (q <= 10) return "02-crashes.md";
  if (q <= 19) return "03-models.md";
  if (q <= 24) return "04-loading.md";
  if (q <= 32) return "05-management.md";
  return "06-performance.md";
}

const COS_BASE = "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting";

let currentFile = "";
for (const r of results) {
  const file = getFile(r.q);
  if (file !== currentFile) {
    currentFile = file;
    console.log(`\n${"=".repeat(60)}`);
    console.log(`FILE: ${file}`);
    console.log(`${"=".repeat(60)}`);
  }
  console.log(`\nQ${r.q} [${r.section}]:`);
  for (const p of r.paragraphs) {
    if (p.type === "image") {
      for (const n of p.nums) {
        const key = Object.keys(rIdMap).find(k => rIdMap[k].startsWith(`media/image${n}.`));
        const ext = key ? rIdMap[key].split(".").pop() : "png";
        console.log(`  [IMG] image${n}.${ext}  ← ${COS_BASE}/image${n}.${ext}`);
      }
    } else {
      // Truncate long text
      const preview = p.content.length > 120 ? p.content.slice(0, 120) + "..." : p.content;
      console.log(`  ${preview}`);
    }
  }
}
