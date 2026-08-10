param(
  $DocxPath = "d:\BaiduNetdiskDownload\WaveMod\鸣潮mod问题解答v2.2.4-专业版.docx",
  $ExtractDir = "$env:TEMP\docx_extract_v2"
)

if (Test-Path $ExtractDir) { Remove-Item -Recurse -Force $ExtractDir }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($DocxPath, $ExtractDir)

[xml]$doc = Get-Content "$ExtractDir\word\document.xml" -Encoding UTF8
[xml]$rels = Get-Content "$ExtractDir\word\_rels\document.xml.rels" -Encoding UTF8

$ns = @{
  w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  a='http://schemas.openxmlformats.org/drawingml/2006/main'
}

# Build rId -> image target map
$rIdMap = @{}
foreach ($rel in $rels.Relationships.Relationship) {
  $rIdMap[$rel.Id] = $rel.Target
}

$paras = $doc.Document.body.p
$results = @()
$currentQ = 0
$images = @()

foreach ($p in $paras) {
  $textNodes = $p | Select-Xml -Namespace $ns -XPath './/w:t' | ForEach-Object { $_.Node.InnerText }
  $text = if ($textNodes) { [string]::Join('', $textNodes) } else { '' }

  $blips = $p | Select-Xml -Namespace $ns -XPath './/a:blip/@r:embed' | ForEach-Object { $rIdMap[$_.Node.Value] }

  if ($blips.Count -gt 0) {
    foreach ($imgPath in $blips) {
      $imgName = [System.IO.Path]::GetFileNameWithoutExtension($imgPath)
      $imgNum = [regex]::Match($imgName, '\d+').Value
      if ($currentQ -gt 0 -and $imgNum) {
        $images += $imgNum
      }
    }
  }
  elseif ($text -match '^Q(\d+)') {
    if ($currentQ -gt 0) {
      $results += [PSCustomObject]@{ Q = $currentQ; Images = @($images) }
    }
    $currentQ = [int]$matches[1]
    $images = @()
  }
}

if ($currentQ -gt 0) {
  $results += [PSCustomObject]@{ Q = $currentQ; Images = @($images) }
}

function Get-FileForQ($q) {
  if ($q -le 4) { return "01-installation.md" }
  if ($q -le 10) { return "02-crashes.md" }
  if ($q -le 19) { return "03-models.md" }
  if ($q -le 24) { return "04-loading.md" }
  if ($q -le 32) { return "05-management.md" }
  return "06-performance.md"
}

Write-Host "=== Image -> Q&A Mapping ==="
$currentFile = ''
foreach ($r in $results) {
  $targetFile = Get-FileForQ $r.Q
  if ($targetFile -ne $currentFile) {
    $currentFile = $targetFile
    Write-Host ""
    Write-Host "--- $currentFile ---"
  }
  $imgList = if ($r.Images.Count -gt 0) { ($r.Images | ForEach-Object { "image$_" }) -join ', ' } else { '(none)' }
  Write-Host "Q$($r.Q): $imgList"
}
