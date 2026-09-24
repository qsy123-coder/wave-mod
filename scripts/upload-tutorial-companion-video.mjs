/**
 * 上传「图文教程配套视频」到 COS，并把 URL 写进 tutorial_configs（页面级视频，非章节视频）。
 *
 * 为什么是页面级而不是章节级：这段 3:56 的录屏演示的是**整篇**图文教程的全流程
 * （解压 → XXMI → JASM → 贴图修复），对应不到某一章。见 supabase/add_tutorial_companion_video.sql。
 *
 * 为什么自带 CacheControl：这是给「加载要快」服务的。对象键带版本号、内容不覆盖，
 * 所以可以放心让浏览器/COS 长缓存（max-age=31536000），二次访问 0 字节。
 * 换视频时不要覆盖同一个键，把 --version 递增即可（旧键留在 COS 上不影响）。
 * 对照：reupload-mod-image.mjs 的键会被覆盖，所以那边用的是 no-cache。
 *
 * 转码（不在本脚本里做，ffmpeg 不是项目依赖，这条命令留作复现用）：
 *   ffmpeg -i 视频教程.mp4 -vf scale=1440:-2:flags=lanczos \
 *     -c:v libx264 -crf 35 -preset slow -pix_fmt yuv420p -profile:v high -level 4.1 \
 *     -x264-params keyint=60:min-keyint=30:scenecut=40 \
 *     -c:a aac -b:a 96k -ac 2 -movflags +faststart out.mp4
 *   ffmpeg -ss 2 -i out.mp4 -frames:v 1 -vf scale=1440:-2:flags=lanczos \
 *     -c:v libwebp -quality 82 poster.webp
 * 原始素材 2558x1598/28.58MB → 1440x900/12.36MB；CRF 31/33/35/37 实测 17.9/14.9/12.4/10.3MB，
 * CRF 37 起黑色面板里的小号 UI 文字出现可见压缩块，故取 35。
 *
 * 用法：
 *   node scripts/upload-tutorial-companion-video.mjs --video=<mp4> --poster=<webp> --dry-run
 *   node scripts/upload-tutorial-companion-video.mjs --video=<mp4> --poster=<webp>
 *   node scripts/upload-tutorial-companion-video.mjs --version=2 --video=… --poster=…   # 换视频
 *   node scripts/upload-tutorial-companion-video.mjs --video=… --poster=… --no-db       # 只传不写库
 *
 * ⚠️ dotenv 并不在 package.json 里（只靠 node_modules 提升存在），所以必须
 * 从仓库根目录跑：node scripts/upload-tutorial-companion-video.mjs
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import COS from "cos-nodejs-sdk-v5";
import { config } from "dotenv";

import { dollarQuote, psqlJson } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

/** 目标版本：前台 /guide 实际展示的就是 v（新版教程，is_default=true） */
const TARGET_VERSION_ID = "v";
const TARGET_STATUS = "published";

/** 长缓存：键带版本号、内容不覆盖，所以可以当 immutable 用 */
const CACHE_CONTROL = "max-age=31536000";

function readArg(name) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

const version = (readArg("--version")?.trim() || "1").replace(/[^a-zA-Z0-9._-]/g, "");
const videoPath = readArg("--video")?.trim();
const posterPath = readArg("--poster")?.trim();
const isDryRun = process.argv.includes("--dry-run");
const skipDb = process.argv.includes("--no-db");

if (!videoPath || !posterPath) {
  console.error("❌ 需要 --video=<本地 mp4 路径> 和 --poster=<本地 webp 路径>");
  console.error("   例：node scripts/upload-tutorial-companion-video.mjs --video=out.mp4 --poster=poster.webp --dry-run");
  process.exit(1);
}

for (const [label, p] of [["--video", videoPath], ["--poster", posterPath]]) {
  if (!existsSync(p)) {
    console.error(`❌ ${label} 文件不存在：${p}`);
    process.exit(1);
  }
}

const cosBucket = process.env.COS_BUCKET?.trim();
const cosRegion = process.env.COS_REGION?.trim();
const cosSecretId = process.env.COS_SECRET_ID?.trim();
const cosSecretKey = process.env.COS_SECRET_KEY?.trim();

if (!cosBucket || !cosRegion || !cosSecretId || !cosSecretKey) {
  console.error("❌ 缺少 COS_BUCKET / COS_REGION / COS_SECRET_ID / COS_SECRET_KEY（本地在 .env.local）");
  process.exit(1);
}

const KEY_BASE = `tutorial/companion/${version}`;
const videoKey = `${KEY_BASE}/tutorial.mp4`;
const posterKey = `${KEY_BASE}/poster.webp`;

function buildCosUrl(objectKey) {
  return `https://${cosBucket}.cos.${cosRegion}.myqcloud.com/${objectKey}`;
}

const videoUrl = buildCosUrl(videoKey);
const posterUrl = buildCosUrl(posterKey);

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)}MB`;

console.log("=== 图文教程配套视频 ===");
console.log(`  版本段      ${version}`);
console.log(`  视频        ${videoPath}  ${mb(statSync(videoPath).size)}`);
console.log(`  封面        ${posterPath}  ${(statSync(posterPath).size / 1024).toFixed(0)}KB`);
console.log(`  → ${videoKey}`);
console.log(`  → ${posterKey}`);
console.log(`  Cache-Control: ${CACHE_CONTROL}`);

if (isDryRun) {
  console.log("\n--dry-run：不传、不写库。");
  process.exit(0);
}

const cos = new COS({ SecretId: cosSecretId, SecretKey: cosSecretKey });

/** 单对象上传。Body 用 Buffer（12MB 级别 putObject 足够，无需分片）。 */
function putObject(objectKey, filePath, contentType) {
  return new Promise((resolvePromise, rejectPromise) => {
    cos.putObject(
      {
        Bucket: cosBucket,
        Region: cosRegion,
        Key: objectKey,
        Body: readFileSync(filePath),
        ContentType: contentType,
        CacheControl: CACHE_CONTROL,
      },
      (err) => {
        if (err) rejectPromise(new Error(`${objectKey} 上传失败：${err.message}`));
        else resolvePromise();
      },
    );
  });
}

/**
 * 回读对象，确认长度与缓存头真的落地（照 check-cos-object.mjs 的口径）。
 *
 * ⚠️ SDK v3 的 headObject **不再把 Content-Length/ContentType 平铺在返回对象上**，
 * 而是塞在 `data.headers` 里、且键名全小写（content-length / content-type / cache-control）。
 * 按 v2 的 `head.ContentLength` 读会永远得到 undefined —— 下面的校验会静默跳过，
 * 「传上去了但其实是 webp 被当成 mp4」这种错就查不出来。
 */
function headObject(objectKey) {
  return new Promise((resolvePromise) => {
    cos.headObject({ Bucket: cosBucket, Region: cosRegion, Key: objectKey }, (err, data) =>
      resolvePromise(err ? { err } : data),
    );
  });
}

/** 从 headObject 结果里取小写头；取不到返回 undefined（让调用方明确判空，不要静默通过） */
function headerOf(head, name) {
  return head?.headers?.[name] ?? head?.[name];
}

console.log("\n上传中…");
await putObject(videoKey, videoPath, "video/mp4");
console.log(`  ✅ ${videoKey}`);
await putObject(posterKey, posterPath, "image/webp");
console.log(`  ✅ ${posterKey}`);

// 写入 tutorial_configs：页面级视频两列
if (skipDb) {
  console.log("\n--no-db：跳过写库。前台还需要手工把下面两行写进 tutorial_configs：");
  console.log(`  video_src    = ${videoUrl}`);
  console.log(`  video_poster = ${posterUrl}`);
} else {
  // 多语句 SQL，末尾产出一条 JSON 供 psqlJson 解析并回读校验。
  // 带 where 的 update：版本/状态不存在时 row_count 为 0，下面会据此报错，不会静默成功。
  const sql = `
update public.tutorial_configs
   set video_src    = ${dollarQuote(videoUrl)},
       video_poster = ${dollarQuote(posterUrl)},
       updated_at   = now()
 where version_id = ${dollarQuote(TARGET_VERSION_ID)}
   and status     = ${dollarQuote(TARGET_STATUS)};

select json_build_object(
  'row_count',       (select count(*) from public.tutorial_configs
                       where version_id = ${dollarQuote(TARGET_VERSION_ID)}
                         and status = ${dollarQuote(TARGET_STATUS)}),
  'updated_rows',    (select count(*) from public.tutorial_configs
                       where version_id = ${dollarQuote(TARGET_VERSION_ID)}
                         and status = ${dollarQuote(TARGET_STATUS)}
                         and video_src = ${dollarQuote(videoUrl)}),
  'video_src',       (select video_src from public.tutorial_configs
                       where version_id = ${dollarQuote(TARGET_VERSION_ID)}
                         and status = ${dollarQuote(TARGET_STATUS)}),
  'video_poster',    (select video_poster from public.tutorial_configs
                       where version_id = ${dollarQuote(TARGET_VERSION_ID)}
                         and status = ${dollarQuote(TARGET_STATUS)})
)::text;
`;

  const result = await psqlJson(sql);

  if (!result || result.updated_rows !== 1) {
    console.error(`\n❌ 写库未生效：匹配到 ${result?.row_count ?? 0} 行、成功写入 ${result?.updated_rows ?? 0} 行`);
    console.error(`   目标 ${TARGET_VERSION_ID}:${TARGET_STATUS} 是否存在于 tutorial_configs？`);
    process.exit(1);
  }

  console.log(`\n✅ 已写入 tutorial_configs（${TARGET_VERSION_ID}:${TARGET_STATUS}）`);
  console.log(`  video_src    = ${result.video_src}`);
  console.log(`  video_poster = ${result.video_poster}`);
}

// 校验：源站对象 + 带 cache-buster 取一次，确认长度、类型、缓存头、分段下载能力
console.log("\n=== 校验 ===");
let verifyFailed = false;

for (const [objectKey, expectContentType] of [
  [videoKey, "video/mp4"],
  [posterKey, "image/webp"],
]) {
  const head = await headObject(objectKey);
  if (head.err) {
    console.error(`  ❌ ${objectKey} headObject 失败：${head.err.message}`);
    process.exit(1);
  }

  const contentType = headerOf(head, "content-type");
  const contentLength = headerOf(head, "content-length");
  const cacheControl = headerOf(head, "cache-control");
  const acceptRanges = headerOf(head, "accept-ranges");

  console.log(`  ${objectKey}`);
  console.log(`    Content-Length ${contentLength ?? "?"}   Content-Type ${contentType ?? "?"}`);
  console.log(`    Last-Modified  ${headerOf(head, "last-modified") ?? "?"}   cache-control ${cacheControl ?? "无"}`);

  // 每一项都显式判空：取不到就是校验失败，不能因为 undefined 静默算过
  if (!contentType) {
    console.error("    ❌ 读不到 content-type（SDK 返回结构可能又变了）");
    verifyFailed = true;
  } else if (contentType !== expectContentType) {
    console.error(`    ❌ Content-Type 期望 ${expectContentType}，实际 ${contentType}`);
    verifyFailed = true;
  }
  if (!contentLength) {
    console.error("    ❌ 读不到 content-length");
    verifyFailed = true;
  }
  if (cacheControl !== CACHE_CONTROL) {
    console.error(`    ❌ cache-control 期望 ${CACHE_CONTROL}，实际 ${cacheControl ?? "无"}`);
    verifyFailed = true;
  }
  // 分段下载：没它浏览器就只能整段下完才起播，「快」的前提就没了
  if (acceptRanges !== "bytes") {
    console.error(`    ❌ accept-ranges 期望 bytes，实际 ${acceptRanges ?? "无"} —— 无法分段下载，起播会变慢`);
    verifyFailed = true;
  }

  const res = await fetch(`${buildCosUrl(objectKey)}?t=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache" },
  });
  const got = Buffer.from(await res.arrayBuffer());
  console.log(`    经 URL 取回 HTTP ${res.status}, ${(got.length / 1024).toFixed(1)}KB, cache-control: ${res.headers.get("cache-control") ?? "无"}`);
  if (res.status !== 200) {
    console.error(`    ❌ 经 URL 取不到对象（HTTP ${res.status}）—— bucket 读策略或键名有问题`);
    verifyFailed = true;
  }
}

if (verifyFailed) {
  console.error("\n❌ 校验未通过，见上面 ❌ 行。");
  process.exit(1);
}

console.log("\n✅ 校验通过。前台 /guide 会读库里的这两列；/guide 是动态渲染，不需要 ping /api/revalidate。");
