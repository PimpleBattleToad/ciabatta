# Раздаёт калькулятор чиабатты по Wi-Fi, чтобы открыть его на телефоне.
# Запуск:  pwsh -File .\serve-lan.ps1            (порт по умолчанию 8080)
#          pwsh -File .\serve-lan.ps1 -Port 8081
param([int]$Port = 8080)

$node = $null
$cmd = Get-Command node -ErrorAction SilentlyContinue
if ($cmd) { $node = $cmd.Source }
if (-not $node) {
  # запасной вариант: node, встроенный в DeepSeek Harness
  $bundled = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path $bundled) { $node = $bundled }
}
if (-not $node) {
  Write-Host 'Не найден node.exe. Установите Node.js или запустите сервер средствами DSH.' -ForegroundColor Red
  exit 1
}

Write-Host "Запускаю статический сервер (node: $node)" -ForegroundColor DarkGray
& $node (Join-Path $PSScriptRoot 'serve-lan.js') $Port
