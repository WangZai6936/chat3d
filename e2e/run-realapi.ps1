# Run the real-API e2e (realapi.mjs) with config read from the built app's localStorage.
# ASCII-only script; the key is passed via env var to the node process and never printed.
$ErrorActionPreference = 'Stop'
Set-Location 'E:\code\model\chat3d'
$scratch = 'C:\Users\10071\.pi-desktop\scratch\364d1615-5e59-4f46-bfcf-44ffabd0c66c'

$cfg = node "C:\Users\10071\.pi-desktop\scratch\364d1615-5e59-4f46-bfcf-44ffabd0c66c\read-cfg.js"
if ([string]::IsNullOrEmpty($cfg)) { Write-Host 'CONFIG NOT FOUND in localStorage'; exit 2 }
Write-Host ('config: baseURL={0} model={1} keyLen={2}' -f ($cfg | ConvertFrom-Json | Select-Object -ExpandProperty baseURL), ($cfg | ConvertFrom-Json | Select-Object -ExpandProperty model), ($cfg | ConvertFrom-Json | Select-Object -ExpandProperty apiKey).Length)

$vite = Start-Process -FilePath 'E:\soft\nodejs\node.exe' `
  -ArgumentList '.\node_modules\vite\bin\vite.js' `
  -WorkingDirectory 'E:\code\model\chat3d' `
  -RedirectStandardOutput "$scratch\vite.log" `
  -RedirectStandardError "$scratch\vite.err" -PassThru
$ready = $false
for ($i = 1; $i -le 30; $i++) {
  Start-Sleep -Seconds 1
  try { $r = Invoke-WebRequest -Uri 'http://localhost:1420' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch { }
}
if (-not $ready) { Write-Host 'VITE FAILED TO START'; Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue; exit 1 }
Write-Host "vite ready PID=$($vite.Id)"

$env:CHAT3D_CFG = $cfg
node e2e/realapi.mjs
$code = $LASTEXITCODE
Remove-Item Env:\CHAT3D_CFG
Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue
Write-Host "realapi exit=$code"
exit $code
