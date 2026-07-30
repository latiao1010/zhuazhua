$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverScript = Join-Path $projectRoot 'server\deepseek-proxy.js'
$devtoolsProcess = Get-Process -Name 'wechatdevtools' -ErrorAction SilentlyContinue |
  Where-Object { $_.Path } |
  Select-Object -First 1
$bundledNode = if ($devtoolsProcess) {
  Join-Path (Split-Path -Parent $devtoolsProcess.Path) 'node.exe'
}
$systemNode = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($bundledNode -and (Test-Path -LiteralPath $bundledNode)) {
  $bundledNode
} elseif ($systemNode) {
  $systemNode.Source
} else {
  throw 'Node.js was not found. Start WeChat DevTools first or install Node.js.'
}

$existing = Get-NetTCPConnection -LocalPort 8789 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  Write-Output 'AI proxy is already running at http://127.0.0.1:8789'
  exit 0
}

$stdout = Join-Path $projectRoot 'server\ai-proxy.out.log'
$stderr = Join-Path $projectRoot 'server\ai-proxy.err.log'
$process = Start-Process -FilePath $nodePath `
  -ArgumentList $serverScript `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru

Start-Sleep -Seconds 1
if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
  $message = if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Raw } else { 'Unknown startup error.' }
  throw "AI proxy failed to start: $message"
}

$health = Invoke-RestMethod -Uri 'http://127.0.0.1:8789/health' -TimeoutSec 5
Write-Output "AI proxy started (PID $($process.Id), model $($health.model))."
