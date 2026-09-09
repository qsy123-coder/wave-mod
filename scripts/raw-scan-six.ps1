# 直接扫描每一份 xlsx 的原始 sharedStrings,按 token 定位行并抓 name+link+pwd。
# 路径从 _xllist.json 读取,本脚本不含中文。
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$utf8 = [System.Text.Encoding]::UTF8
$files = [System.IO.File]::ReadAllText("C:\Users\qsy123\AppData\Local\Temp\_xllist.json", $utf8) | ConvertFrom-Json

function ReadEntry($zip,$name){ $e=$zip.Entries|Where-Object{$_.FullName -eq $name}; if(-not $e){return ""}; $sr=New-Object System.IO.StreamReader($e.Open()); $s=$sr.ReadToEnd();$sr.Dispose();$s }
function SS($xml){ $arr=New-Object System.Collections.ArrayList; $ms=[regex]::Matches($xml,'<si>(.*?)</si>','Singleline'); foreach($m in $ms){ $ts=[regex]::Matches($m.Groups[1].Value,'<t[^>]*>(.*?)</t>','Singleline');$sb="";foreach($t in $ts){$sb+=[System.Net.WebUtility]::HtmlDecode($t.Groups[1].Value)};[void]$arr.Add($sb)}; return $arr }

$tokens = [System.IO.File]::ReadAllText("C:\Users\qsy123\AppData\Local\Temp\_tokens.json", $utf8) | ConvertFrom-Json
$found = 0
foreach($f in $files){
  $tmp="C:\Users\qsy123\AppData\Local\Temp\_scan.xlsx"
  Copy-Item -LiteralPath $f -Destination $tmp -Force
  try{
    $zip=[System.IO.Compression.ZipFile]::OpenRead($tmp)
    $ss=SS (ReadEntry $zip "xl/sharedStrings.xml")
    $sheet=ReadEntry $zip "xl/worksheets/sheet1.xml"
    $zip.Dispose()
    # 行解析:每行 B,C,D
    $rows=[regex]::Matches($sheet,'<row[^>]*>(.*?)</row>','Singleline')
    foreach($rm in $rows){
      $b="";$c="";$d=""
      $cm=[regex]::Matches($rm.Groups[1].Value,'<c r="([A-Z]+)\d+"[^>]*>(.*?)</c>','Singleline')
      foreach($cc in $cm){$col=$cc.Groups[1].Value;$inner=$cc.Groups[2].Value;$v=[regex]::Match($inner,'<v>([^<]*)</v>');$idx=0;if($v.Success){$idx=[int]$v.Groups[1].Value};$val=if($idx -lt $ss.Count){$ss[$idx]}else{""};if($col -eq "B"){$b=$val}elseif($col -eq "C"){$c=$val}elseif($col -eq "D"){$d=$val}}
      if($c -like "http*"){
        foreach($tk in $tokens){ if($b -and $b.Contains($tk)){ $found++; Write-Host ("[" + $tk + "] " + $b + " | " + $c + " | " + $d); break } }
      }
    }
  } catch { Write-Host "  skip $f : $($_.Exception.Message)" }
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}
Write-Host ("TOTAL hit rows = " + $found)
