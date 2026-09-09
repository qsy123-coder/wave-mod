# 解析 W-2026.9.4 的单日 xlsx（路径经 Get-ChildItem 解析，避免编码问题），合并进 daily-xunlei.json
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-ZipEntry($zip, $path){
  $e = $zip.GetEntry($path)
  if(-not $e){ return "" }
  $sr = New-Object System.IO.StreamReader($e.Open())
  $t = $sr.ReadToEnd(); $sr.Close()
  return $t
}

$dir = Get-ChildItem -Path "D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新" -Directory | Where-Object { $_.Name -eq "W-2026.9.4" }
$f = Get-ChildItem -Path $dir.FullName -Filter "分享结果导出-*.xlsx" | Select-Object -First 1
if(-not $f){ Write-Output "NOFILE"; exit 0 }
Write-Output "File: $($f.Name)"

try {
  $fs = New-Object System.IO.FileStream($f.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  $ms = New-Object System.IO.MemoryStream
  $fs.CopyTo($ms)
  $fs.Close()
  $ms.Position = 0
} catch {
  Write-Output "LOCKED: $($_.Exception.Message)"
  exit 0
}

$zip = New-Object System.IO.Compression.ZipArchive($ms, [System.IO.Compression.ZipArchiveMode]::Read)
$ss = Read-ZipEntry $zip "xl/sharedStrings.xml"
$sheet = Read-ZipEntry $zip "xl/worksheets/sheet1.xml"
$zip.Dispose()

$strings = [System.Collections.Generic.List[string]]::new()
[regex]::Matches($ss, '<si>.*?</si>', 'Singleline') | ForEach-Object {
  $texts = [regex]::Matches($_.Value, '<t[^>]*>(.*?)</t>', 'Singleline')
  $val = ($texts | ForEach-Object { [System.Net.WebUtility]::HtmlDecode($_.Groups[1].Value) }) -join ''
  $strings.Add($val.Replace("&#10;","`n"))
}

$recs = [System.Collections.Generic.List[object]]::new()
$rows = [regex]::Matches($sheet, '<row[^>]*>(.*?)</row>', 'Singleline')
foreach($r in $rows){
  $cells = [regex]::Matches($r.Groups[1].Value, '<c[^>]*>.*?</c>|<c[^>]*/>', 'Singleline')
  $vals = @{}
  foreach($c in $cells){
    $ref = [regex]::Match($c.Value, 'r="([A-Z]+)\d+"').Groups[1].Value
    $st  = [regex]::Match($c.Value, 't="([^"]+)"').Groups[1].Value
    $inl = [regex]::Match($c.Value, '<is><t[^>]*>(.*?)</t>', 'Singleline').Groups[1].Value
    $v   = [regex]::Match($c.Value, '<v>(.*?)</v>', 'Singleline').Groups[1].Value
    if($st -eq "s"){ $vals[$ref] = $strings[[int]$v] }
    elseif($inl){ $vals[$ref] = [System.Net.WebUtility]::HtmlDecode($inl) }
    else { $vals[$ref] = $v }
  }
  if($vals["B"] -and $vals["C"]){
    $recs.Add([PSCustomObject]@{ date="W-2026.9.4"; name=$vals["B"]; link=$vals["C"]; pwd=if($vals["D"]){$vals["D"]}else{""}; time=if($vals["E"]){$vals["E"]}else{""} })
  }
}
Write-Output "W-2026.9.4 -> $($recs.Count) records"
Write-Output "---- sample ----"
$recs | Select-Object -First 5 | ForEach-Object { Write-Output "$($_.name) | $($_.link)" }

$existing = Get-Content "C:\Users\qsy123\.claude\projects\D--BaiduNetdiskDownload-WaveMod\daily-xunlei.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$merge = @($existing) + @($recs)
$json = $merge | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText("C:\Users\qsy123\.claude\projects\D--BaiduNetdiskDownload-WaveMod\daily-xunlei.json", $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "merged total: $($merge.Count)"
