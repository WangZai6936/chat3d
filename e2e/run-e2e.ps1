# chat3d E2E runner: vite dev server -> Playwright DOM assertions -> canvas pixel analysis
# PS 5.1 reads no-BOM UTF-8 as GBK, so keep this file ASCII (Chinese lives in smoke.mjs, which Node reads as UTF-8)
$ErrorActionPreference = 'Stop'
Set-Location 'E:\code\model\chat3d'
$scratch = 'C:\Users\10071\.pi-desktop\scratch\364d1615-5e59-4f46-bfcf-44ffabd0c66c'
$shots = 'E:\code\model\chat3d\e2e\shots'

# ---- 1. vite dev server ----
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
if (-not $ready) {
  Write-Host 'VITE FAILED TO START'
  Get-Content "$scratch\vite.err" -ErrorAction SilentlyContinue
  Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue
  exit 1
}
Write-Host "vite ready PID=$($vite.Id)"

# ---- 2. DOM assertions ----
node e2e/smoke.mjs
$domCode = $LASTEXITCODE
Write-Host "DOM assertion exit=$domCode"

# ---- 3. canvas pixel analysis ----
Add-Type -AssemblyName System.Drawing
function NonBgCount($path) {
  $b = New-Object System.Drawing.Bitmap($path)
  $n = 0
  for ($y = 0; $y -lt $b.Height; $y += 2) {
    for ($x = 0; $x -lt $b.Width; $x += 2) {
      $c = $b.GetPixel($x, $y)
      if (-not ([Math]::Abs([int]$c.R - 32) -le 6 -and [Math]::Abs([int]$c.G - 36) -le 6 -and [Math]::Abs([int]$c.B - 40) -le 6)) { $n++ }
    }
  }
  $size = "$($b.Width)x$($b.Height)"
  $b.Dispose()
  return @{ n = $n; size = $size }
}
$empty = NonBgCount "$shots\canvas-empty.png"
$preview = NonBgCount "$shots\canvas-preview.png"
$undo = NonBgCount "$shots\canvas-undo.png"
$redo = NonBgCount "$shots\canvas-redo.png"
Write-Host ("canvas empty : {0} ({1})" -f $empty.n, $empty.size)
Write-Host ("canvas preview: {0} (delta {1})" -f $preview.n, ($preview.n - $empty.n))
Write-Host ("canvas undo  : {0} (delta {1})" -f $undo.n, ($undo.n - $empty.n))
Write-Host ("canvas redo  : {0} (delta {1})" -f $redo.n, ($redo.n - $empty.n))

# workbench geometry projected at low viewing angle is ~1-2% of viewport; key signal is state symmetry
$p1 = $preview.n -ge $empty.n + 1000
$p2 = [Math]::Abs($undo.n - $empty.n) -le 200
$p3 = [Math]::Abs($redo.n - $preview.n) -le 200
if ($p1) { Write-Host 'PASS  preview: viewport renders workbench geometry' } else { Write-Host 'FAIL  preview: viewport renders workbench geometry' }
if ($p2) { Write-Host 'PASS  undo: viewport back to empty scene' } else { Write-Host 'FAIL  undo: viewport back to empty scene' }
if ($p3) { Write-Host 'PASS  redo: viewport re-renders workbench' } else { Write-Host 'FAIL  redo: viewport re-renders workbench' }

Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue
$pixelPass = $p1 -and $p2 -and $p3
$total = if ($domCode -eq 0 -and $pixelPass) { 0 } else { 1 }
Write-Host "==== final exit=$total (0 = all passed) ===="
exit $total
