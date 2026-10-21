# Parse every "分享结果导出-*.xlsx" (Xunlei share export) inside W-YYYY.M.D date
# folders under -Root, into one JSON array.
#
# Columns: A=创建分享状态  B=分享名  C=分享链接  D=提取码  E=分享时间
#
# Output JSON: [{ day, name, link, pwd, time, file }]  (deduped by share name)
#
# NOTE: intentionally ASCII-only source (no Chinese literals) so Windows
# PowerShell 5.1 reads it correctly regardless of the ANSI code page; paths are
# passed in as parameters.
#
# Usage:
#   powershell -File scripts/parse-daily-xunlei-xlsx.ps1 `
#     -Root "D:\...\A_每日更新" -OutJson "C:\...\daily-xunlei.json"
param(
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$OutJson,
  [string]$DirPattern = "W-*"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

# OOXML files are ZIP archives: they start with the magic bytes "PK\x03\x04".
# The Xunlei export is sometimes saved with a ".csv" extension (it is still an
# OOXML workbook), so pick files by CONTENT, not by extension. The Quark CSV in
# the same folder fails this check and is skipped.
function Test-ZipSignature([string]$path) {
  try {
    $fs = [System.IO.File]::OpenRead($path)
    try {
      $buf = New-Object byte[] 4
      $n = $fs.Read($buf, 0, 4)
      return ($n -eq 4 -and $buf[0] -eq 0x50 -and $buf[1] -eq 0x4B -and `
              $buf[2] -eq 0x03 -and $buf[3] -eq 0x04)
    } finally { $fs.Dispose() }
  } catch { return $false }
}

function Read-ZipEntry($zip, $path) {
  $e = $zip.GetEntry($path)
  if (-not $e) { return "" }
  $sr = New-Object System.IO.StreamReader($e.Open())
  $t = $sr.ReadToEnd(); $sr.Close()
  return $t
}

# sharedStrings.xml -> array of strings (rich text runs are concatenated)
function Parse-SharedStrings($xml) {
  $list = [System.Collections.Generic.List[string]]::new()
  foreach ($si in [regex]::Matches($xml, '<si>.*?</si>', 'Singleline')) {
    $texts = [regex]::Matches($si.Value, '<t[^>]*>(.*?)</t>', 'Singleline')
    $val = ($texts | ForEach-Object { [System.Net.WebUtility]::HtmlDecode($_.Groups[1].Value) }) -join ''
    $list.Add($val)
  }
  return $list
}

$records = [System.Collections.Generic.List[object]]::new()

$dirs = Get-ChildItem -LiteralPath $Root -Directory | Where-Object { $_.Name -like $DirPattern } |
  Sort-Object Name
Write-Host ("date folders: " + $dirs.Count)

foreach ($d in $dirs) {
  # Only .xlsx/.csv are candidates (keeps the 4-byte sniff off .exe/.png files),
  # then the signature check decides which ones are really OOXML.
  $files = Get-ChildItem -LiteralPath $d.FullName |
    Where-Object { -not $_.PSIsContainer -and ($_.Extension -eq ".xlsx" -or $_.Extension -eq ".csv") } |
    Sort-Object Name
  foreach ($f in $files) {
    if (-not (Test-ZipSignature $f.FullName)) { continue }
    $zip = [System.IO.Compression.ZipFile]::OpenRead($f.FullName)
    $strings = Parse-SharedStrings (Read-ZipEntry $zip "xl/sharedStrings.xml")
    $sheet = Read-ZipEntry $zip "xl/worksheets/sheet1.xml"
    $zip.Dispose()

    foreach ($row in [regex]::Matches($sheet, '<row[^>]*>(.*?)</row>', 'Singleline')) {
      $vals = @{}
      foreach ($c in [regex]::Matches($row.Groups[1].Value, '<c[^>]*>.*?</c>|<c[^>]*/>', 'Singleline')) {
        $ref = [regex]::Match($c.Value, 'r="([A-Z]+)\d+"').Groups[1].Value
        $st = [regex]::Match($c.Value, 't="([^"]+)"').Groups[1].Value
        $v = [regex]::Match($c.Value, '<v>(.*?)</v>', 'Singleline').Groups[1].Value
        if ($st -eq "s") {
          $i = 0; [void][int]::TryParse($v, [ref]$i)
          if ($i -lt $strings.Count) { $vals[$ref] = $strings[$i] }
        }
        else { $vals[$ref] = $v }
      }
      # data rows only: share name (B) + link (C); skips the header row
      if ($vals["B"] -and $vals["C"]) {
        $records.Add([PSCustomObject]@{
            day  = $d.Name
            name = $vals["B"]
            link = $vals["C"]
            pwd  = if ($vals["D"]) { $vals["D"] } else { "" }
            time = if ($vals["E"]) { $vals["E"] } else { "" }
            file = $f.Name
          })
      }
    }
  }
}

Write-Host ("rows: " + $records.Count)

$unique = [System.Collections.Generic.List[object]]::new()
$seen = @{}
foreach ($rec in $records) {
  $key = $rec.day + "|" + $rec.name
  if ($seen.ContainsKey($key)) { continue }
  $seen[$key] = $true
  $unique.Add($rec)
}
Write-Host ("deduped: " + $unique.Count)

$parent = Split-Path -Parent $OutJson
if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }

$json = ConvertTo-Json -InputObject @($unique) -Depth 4
[System.IO.File]::WriteAllText($OutJson, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("written: " + $OutJson)
