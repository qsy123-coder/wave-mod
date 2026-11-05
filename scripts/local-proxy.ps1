# 本机 Clash Verge 代理检查 / 切换节点的小工具。
#
# 背景：系统代理是关闭的（Clash Verge 里 System Proxy 未开），所以 git/npm/curl
# 不会自动走代理，必须显式指定 127.0.0.1:7897。当前选中的节点挂掉时，代理口
# 还在监听但会返回 502 或 TLS handshake failed —— 这时换一个节点即可。
#
# 用法：
#   powershell -File scripts/local-proxy.ps1            # 列出可用节点（按延迟排序）
#   powershell -File scripts/local-proxy.ps1 -Best      # 自动切到最快节点
#   powershell -File scripts/local-proxy.ps1 -Use "🇭🇰 香港Anytls 01"
#   powershell -File scripts/local-proxy.ps1 -Verify    # 用 7897 实测 GitHub API
#
# 原理：Clash Verge (Tauri) 默认关闭 TCP 外部控制器，只开命名管道
# \\.\pipe\verge-mihomo（见 %APPDATA%\io.github.clash-verge-rev.clash-verge-rev\config.yaml）。
# 下面用 NamedPipeClientStream 手写 HTTP/1.1 请求，并解 chunked 响应。

param(
  [switch]$List,
  [switch]$Best,
  [string]$Use = '',
  [switch]$Verify
)

$ErrorActionPreference = 'Stop'
$PipeName = 'verge-mihomo'
$Secret = 'set-your-secret'
$ProxyUrl = 'http://127.0.0.1:7897'
$TestUrl = 'http://www.gstatic.com/generate_204'

function Invoke-Mihomo {
  param(
    [Parameter(Mandatory)][ValidateSet('GET', 'PUT')][string]$Method,
    [Parameter(Mandatory)][string]$Path,
    [string]$Body = ''
  )

  $pipe = [System.IO.Pipes.NamedPipeClientStream]::new('.', $PipeName, [System.IO.Pipes.PipeDirection]::InOut)
  try {
    $pipe.Connect(5000)
    $bodyBytes = [Text.Encoding]::UTF8.GetBytes($Body)
    $headers = "Host: localhost`r`nAuthorization: Bearer $Secret`r`nConnection: close`r`n"
    if ($bodyBytes.Length -gt 0) {
      $headers += "Content-Type: application/json`r`nContent-Length: $($bodyBytes.Length)`r`n"
    }
    $requestBytes = [Text.Encoding]::UTF8.GetBytes("$Method $Path HTTP/1.1`r`n$headers`r`n")
    $pipe.Write($requestBytes, 0, $requestBytes.Length)
    if ($bodyBytes.Length -gt 0) { $pipe.Write($bodyBytes, 0, $bodyBytes.Length) }
    $pipe.Flush()

    $buffer = New-Object byte[] 65536
    $stream = New-Object System.IO.MemoryStream
    while (($read = $pipe.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $stream.Write($buffer, 0, $read)
    }
    $all = $stream.ToArray()

    $headerEnd = -1
    for ($i = 0; $i -lt $all.Length - 3; $i++) {
      if ($all[$i] -eq 13 -and $all[$i + 1] -eq 10 -and $all[$i + 2] -eq 13 -and $all[$i + 3] -eq 10) {
        $headerEnd = $i
        break
      }
    }
    if ($headerEnd -lt 0) { return [Text.Encoding]::UTF8.GetString($all) }

    $headerText = [Text.Encoding]::ASCII.GetString($all, 0, $headerEnd)
    $statusLine = ($headerText -split "`r`n")[0]
    $payload = [byte[]]@()
    if ($all.Length -gt $headerEnd + 4) { $payload = $all[($headerEnd + 4)..($all.Length - 1)] }

    # 管道响应是 chunked；按字节解，避免多字节 UTF-8 被 chunk 头切断。
    if ($headerText -match '(?i)transfer-encoding:\s*chunked') {
      $decoded = New-Object System.IO.MemoryStream
      $pos = 0
      while ($pos -lt $payload.Length) {
        $lineEnd = $pos
        while ($lineEnd -lt $payload.Length - 1 -and -not ($payload[$lineEnd] -eq 13 -and $payload[$lineEnd + 1] -eq 10)) {
          $lineEnd++
        }
        $sizeText = [Text.Encoding]::ASCII.GetString($payload, $pos, $lineEnd - $pos).Split(';')[0].Trim()
        if (-not $sizeText) { break }
        $size = [Convert]::ToInt32($sizeText, 16)
        $pos = $lineEnd + 2
        if ($size -eq 0) { break }
        $decoded.Write($payload, $pos, $size)
        $pos += $size + 2
      }
      $payload = $decoded.ToArray()
    }

    $text = [Text.Encoding]::UTF8.GetString($payload)
    # PUT（切换节点）成功时返回 204 No Content
    if ($statusLine -notmatch ' 2\d\d ') { throw "mihomo API $Method $Path -> $statusLine`n$text" }
    return $text
  }
  finally {
    $pipe.Dispose()
  }
}

# 订阅里的「剩余流量 / 套餐到期」等伪节点、以及组自身（自动选择/故障转移）都不能选
function Test-RealNode([string]$name, $proxies) {
  if ($name -match '剩余流量|距离下次|套餐到期|^DIRECT$|^REJECT$') { return $false }
  $type = $proxies.$name.type
  return $type -notin @('Selector', 'URLTest', 'Fallback', 'Direct', 'Reject')
}

$proxies = (Invoke-Mihomo -Method GET -Path '/proxies') | ConvertFrom-Json
$selector = $proxies.proxies.GLOBAL
Write-Host "当前节点: $($selector.now)"

$encodedTestUrl = [uri]::EscapeDataString($TestUrl)
$delayJson = Invoke-Mihomo -Method GET -Path "/group/GLOBAL/delay?url=$encodedTestUrl&timeout=5000"
$delays = $delayJson | ConvertFrom-Json

$working = $delays.PSObject.Properties |
  Where-Object { (Test-RealNode $_.Name $proxies.proxies) -and $_.Value -is [int] -and $_.Value -gt 0 } |
  Sort-Object { [int]$_.Value } |
  ForEach-Object { [pscustomobject]@{ Delay = [int]$_.Value; Name = $_.Name } }

if ($working.Count -eq 0) {
  Write-Error "没有任何节点通过测速。请打开 Clash Verge 更新订阅或检查网络。"
  exit 1
}

if ($List -or (-not $Best -and -not $Use -and -not $Verify)) {
  Write-Host "可用节点（延迟 ms）:"
  $working | ForEach-Object { Write-Host ("  {0,4}  {1}" -f $_.Delay, $_.Name) }
}

if ($Best) {
  $target = $working[0].Name
  Invoke-Mihomo -Method PUT -Path '/proxies/GLOBAL' -Body (@{ name = $target } | ConvertTo-Json -Compress) | Out-Null
  Write-Host "已切换到最快节点: $target ($($working[0].Delay) ms)"
  $selector = ((Invoke-Mihomo -Method GET -Path '/proxies') | ConvertFrom-Json).proxies.GLOBAL
  Write-Host "确认当前节点: $($selector.now)"
}

if ($Use) {
  if (-not (Test-RealNode $Use $proxies.proxies)) { throw "「$Use」不是可选节点。" }
  Invoke-Mihomo -Method PUT -Path '/proxies/GLOBAL' -Body (@{ name = $Use } | ConvertTo-Json -Compress) | Out-Null
  Write-Host "已切换到: $Use"
}

if ($Verify) {
  $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 20 --proxy $ProxyUrl 'https://api.github.com'
  Write-Host "GitHub API via ${ProxyUrl}: HTTP $code"
  if ($code -ne '200') { exit 1 }
}
