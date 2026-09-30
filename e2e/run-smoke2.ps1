$ErrorActionPreference = 'Stop'
Set-Location 'E:\code\model\chat3d'
$scratch = 'C:\Users\10071\.pi-desktop\scratch\364d1615-5e59-4f46-bfcf-44ffabd0c66c'

# start vite if not already listening
$vitePidVar = 0
$needStart = $true
try { $r = Invoke-WebRequest -Uri 'http://localhost:1420' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { $needStart = $false } } catch { }
$vite = $null
if ($needStart) {
  $vite = Start-Process -FilePath 'E:\soft\nodejs\node.exe' `
    -ArgumentList '.\node_modules\vite\bin\vite.js' `
    -WorkingDirectory 'E:\code\model\chat3d' `
    -RedirectStandardOutput "$scratch\vite2.log" `
    -RedirectStandardError "$scratch\vite2.err" -PassThru
  for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 1
    try { $r = Invoke-WebRequest -Uri 'http://localhost:1420' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { break } } catch { }
  }
}
Write-Host "vite ready"

node e2e/smoke2.mjs
$code = $LASTEXITCODE
Write-Host "smoke2 exit=$code"

if ($vite -ne $null) { Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue }
exit $code
