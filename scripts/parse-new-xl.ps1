# Parse the new 违规 export xlsx -> print name | link | pwd rows (file list from temp JSON, no Chinese literals here)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$utf8 = [System.Text.Encoding]::UTF8
$files = [System.IO.File]::ReadAllText("C:\Users\qsy123\AppData\Local\Temp\_newxl.json", $utf8) | ConvertFrom-Json

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

foreach ($f in $files) {
  $tmp = "C:\Users\qsy123\AppData\Local\Temp\_newxl_copy.xlsx"
  Copy-Item -LiteralPath $f -Destination $tmp -Force
  $zip = [System.IO.Compression.ZipFile]::OpenRead($tmp)
  $ss = Parse-SharedStrings (Read-ZipEntry $zip "xl/sharedStrings.xml")
  $sheet = Read-ZipEntry $zip "xl/worksheets/sheet1.xml"
  $zip.Dispose()
  $rows = [regex]::Matches($sheet, '<row[^>]*>(.*?)</row>', 'Singleline')
  $n = 0
  foreach ($rm in $rows) {
    $a=""; $b=""; $c=""; $d=""; $e2=""
    $cm = [regex]::Matches($rm.Groups[1].Value, '<c r="([A-Z]+)\d+"[^>]*>(.*?)</c>', 'Singleline')
    foreach ($cc in $cm) {
      $col=$cc.Groups[1].Value; $inner=$cc.Groups[2].Value
      $v=[regex]::Match($inner,'<v>([^<]*)</v>')
      $idx=0; if($v.Success){$idx=[int]$v.Groups[1].Value}
      $val= if($idx -lt $ss.Count){$ss[$idx]}else{""}
      switch($col){ "A"{$a=$val} "B"{$b=$val} "C"{$c=$val} "D"{$d=$val} "E"{$e2=$val} }
    }
    $n++
    Write-Host ("ROW[$n] A=$a | B=$b | C=$c | D=$d | E=$e2")
  }
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}
