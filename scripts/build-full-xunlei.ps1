# Re-parse ALL xunlei share-export xlsx (read file paths from temp JSON list, no Chinese literals here)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$listPath = "C:\Users\qsy123\AppData\Local\Temp\_xllist.json"
$utf8 = [System.Text.Encoding]::UTF8
$files = [System.IO.File]::ReadAllText($listPath, $utf8) | ConvertFrom-Json

function Read-ZipEntry($zip, $name) {
  $e = $zip.Entries | Where-Object { $_.FullName -eq $name }
  if (-not $e) { return "" }
  $sr = New-Object System.IO.StreamReader($e.Open())
  $s = $sr.ReadToEnd(); $sr.Dispose(); return $s
}
function Parse-SharedStrings($xml) {
  $arr = New-Object System.Collections.ArrayList
  $ms = [regex]::Matches($xml, '<si>(.*?)</si>', 'Singleline')
  foreach ($m in $ms) {
    $ts = [regex]::Matches($m.Groups[1].Value, '<t[^>]*>(.*?)</t>', 'Singleline')
    $sb = ""
    foreach ($t in $ts) { $sb += [System.Net.WebUtility]::HtmlDecode($t.Groups[1].Value) }
    [void]$arr.Add($sb)
  }
  return $arr
}

$out = New-Object System.Collections.ArrayList
$seen = New-Object System.Collections.Generic.HashSet[string]
$fileCount = 0
foreach ($f in $files) {
  $fileCount++
  $tmp = "C:\Users\qsy123\AppData\Local\Temp\_xl_$fileCount.xlsx"
  Copy-Item -LiteralPath $f -Destination $tmp -Force
  try {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($tmp)
    $ss = Parse-SharedStrings (Read-ZipEntry $zip "xl/sharedStrings.xml")
    $sheet = Read-ZipEntry $zip "xl/worksheets/sheet1.xml"
    $zip.Dispose()
    $rows = [regex]::Matches($sheet, '<row[^>]*>(.*?)</row>', 'Singleline')
    foreach ($rm in $rows) {
      $b=""; $c=""; $d=""
      $cm = [regex]::Matches($rm.Groups[1].Value, '<c r="([A-Z]+)\d+"[^>]*>(.*?)</c>', 'Singleline')
      foreach ($cc in $cm) {
        $col=$cc.Groups[1].Value; $inner=$cc.Groups[2].Value
        $v=[regex]::Match($inner,'<v>([^<]*)</v>')
        $idx=0; if($v.Success){$idx=[int]$v.Groups[1].Value}
        $val= if($idx -lt $ss.Count){$ss[$idx]}else{""}
        if($col -eq "B"){$b=$val}elseif($col -eq "C"){$c=$val}elseif($col -eq "D"){$d=$val}
      }
      if($b -and $c -and $c -like "http*"){ $k="$b|$c"; if($seen.Add($k)){[void]$out.Add([pscustomobject]@{name=$b;link=$c;pwd=$d})} }
    }
  } catch { Write-Host "  skip: $($_.Exception.Message)" }
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}
$dest="C:\Users\qsy123\.claude\projects\D--BaiduNetdiskDownload-WaveMod\xunlei-full.json"
[System.IO.File]::WriteAllText($dest, ($out | ConvertTo-Json -Depth 4), $utf8)
Write-Host ("DONE files=" + $fileCount + " records=" + $out.Count)
