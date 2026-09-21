# 从 Postgres 导出「已发布 mod」兜底快照 -> data/mods-snapshot.json.gz
#
# 用途：当 Supabase 的 HTTP 网关不可用（典型：项目因 exceed_egress_quota 被
# restriction，REST/Auth 全站 402）时，src/lib/mods-domain/snapshot.ts 会读取本快照，
# 让前台仍能浏览、搜索、翻页、打开详情页。
#
# 为什么走 psql 而不是 @supabase/supabase-js：
#   网关封的是 HTTP 层，直连 Postgres（5432 pooler）不受影响；且这样无需引入 pg 依赖。
#
# 用法：
#   powershell -File scripts/export-mods-snapshot.ps1
#
# 产出：data/mods-snapshot.json.gz（约 500KB，提交进仓库）
# 注意：导出的是**只读快照**，网关恢复后无需删除，它会自动退居二线（仅在读失败时生效）。
#       但网关恢复、又有新内容入库后，记得重跑本脚本刷新快照。

$ErrorActionPreference = "Stop"
$env:PGCLIENTENCODING = "UTF8"

$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env.local"
$jsonPath = Join-Path $root "data\mods-snapshot.json"
$gzPath = Join-Path $root "data\mods-snapshot.json.gz"

# ---- 读取 DATABASE_URL（只取这一条，不把整个 env 打进环境） ----
$databaseUrl = $null
foreach ($line in Get-Content $envPath) {
  if ($line -match '^\s*DATABASE_URL\s*=\s*(.*)$') {
    $databaseUrl = $Matches[1].Trim().Trim('"').Trim("'")
    break
  }
}
if (-not $databaseUrl) { throw "❌ .env.local 里找不到 DATABASE_URL" }
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw "❌ 找不到 psql，请先装 PostgreSQL 客户端" }

# ---- 导出 ----
# 不含 xxmi_install_guide：全库仅 2 个近似取值（= install-guide.ts 的静态常量），
# 却占 payload 的 27%；读取时由 snapshot.ts 统一回填常量。
$sql = @"
select json_agg(row_to_json(t) order by t.created_at desc) from (
  select id, title, character, version, game_version, game_key, description,
         images, video_url, download_url, downloads_count, drive_links, nsfw,
         mod_author_url, views, favorites_count, likes_count, comments_count,
         rating_count, rating_average, is_published, is_featured, featured_order, created_at
  from mods
  where is_published = true
) t;
"@

Write-Host "⏳ 正在从 Postgres 导出已发布 mod ..."
if (Test-Path $jsonPath) { Remove-Item $jsonPath -Force }
psql $databaseUrl -t -A -o $jsonPath -c $sql
if (-not (Test-Path $jsonPath)) { throw "❌ psql 未产出文件" }

# ---- 校验：必须是合法 JSON 且行数 > 0 ----
# 用 .NET 显式按 UTF-8 读，避免 PowerShell 5.1 默认按 GBK 误读中文
$rows = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($jsonPath)) | ConvertFrom-Json
if (-not $rows -or $rows.Count -eq 0) { throw "❌ 快照为空，拒绝写出" }
$featuredCount = ($rows | Where-Object { $_.is_featured }).Count
Write-Host "✅ 解析成功：$($rows.Count) 条已发布，其中推荐位 $featuredCount 条"

# ---- gzip（.NET 内置；运行时由 Node 的 zlib.gunzipSync 解） ----
$bytes = [System.IO.File]::ReadAllBytes($jsonPath)
$ms = New-Object System.IO.MemoryStream
$gz = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionLevel]::Optimal)
$gz.Write($bytes, 0, $bytes.Length)
$gz.Close()
[System.IO.File]::WriteAllBytes($gzPath, $ms.ToArray())

# 保留未压缩版会多出 4.7MB 进 git，且运行时只用 .gz
Remove-Item $jsonPath -Force

$gzKb = [math]::Round((Get-Item $gzPath).Length / 1KB)
Write-Host "✅ 已写出 data/mods-snapshot.json.gz  ($gzKb KB)"
