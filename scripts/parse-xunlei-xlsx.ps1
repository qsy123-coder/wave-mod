# 解析「迅雷网盘链接」目录下所有 分享结果导出-*.xlsx
# 输出 JSON: [{ name, link, pwd, file, time }]
param(
  [string]$Dir = "D:\BaiduNetdiskDownload\MC-MOD整合包\迅雷上传\mod整合包\迅雷网盘链接",
  [string]$OutJson
)
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-ZipEntry($zip, $path){
  $e = $zip.GetEntry($path)
  if(-not $e){ return "" }
  $sr = New-Object System.IO.StreamReader($e.Open())
  $t = $sr.ReadToEnd(); $sr.Close()
  return $t
}

$records = [System.Collections.Generic.List[object]]::new()

$files = Get-ChildItem -Path $Dir -Filter "分享结果导出-*.xlsx" | Sort-Object Name
Write-Output ("解析文件数: " + $files.Count)

foreach($f in $files){
  $zip = [System.IO.Compression.ZipFile]::OpenRead($f.FullName)
  $ss = Read-ZipEntry $zip "xl/sharedStrings.xml"
  $sheet = Read-ZipEntry $zip "xl/worksheets/sheet1.xml"
  $zip.Dispose()

  $strings = [System.Collections.Generic.List[string]]::new()
  [regex]::Matches($ss, '<si>.*?</si>', 'Singleline') | ForEach-Object {
    $texts = [regex]::Matches($_.Value, '<t[^>]*>(.*?)</t>', 'Singleline')
    $val = ($texts | ForEach-Object { [System.Net.WebUtility]::HtmlDecode($_.Groups[1].Value) }) -join ''
    $strings.Add($val.Replace("&#10;","`n"))
  }

  $rows = [regex]::Matches($sheet, '<row[^>]*>(.*?)</row>', 'Singleline')
  $count = 0
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
    # 列 A=项目列：仅处理有分享名(B)+链接(C) 的数据行
    if($vals["B"] -and $vals["C"]){
      $count++
      $records.Add([PSCustomObject]@{
        name = $vals["B"]
        link = $vals["C"]
        pwd  = if($vals["D"]){ $vals["D"] } else { "" }
        time = if($vals["E"]){ $vals["E"] } else { "" }
        file = $f.Name
      })
    }
  }
}

$unique = [System.Collections.Generic.List[object]]::new()
$seen = @{}
foreach($rec in $records){
  $key = $rec.name
  if($seen.ContainsKey($key)){ continue }
  $seen[$key] = $true
  $unique.Add($rec)
}

Write-Output ("总行数: " + $records.Count + "   去重后: " + $unique.Count)

# 输出
if($OutJson){
  $json = $unique | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText($OutJson, $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Output ("已写入 JSON: " + $OutJson)
} else {
  $unique | Select-Object name, link, pwd, file | Format-Table -AutoSize
}
