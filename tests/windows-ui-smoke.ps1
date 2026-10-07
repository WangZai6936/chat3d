$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class SmokeMouse {
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
}
'@
$out = Join-Path $PWD 'windows-smoke-results'
New-Item $out -ItemType Directory -Force | Out-Null
$checks = [System.Collections.Generic.List[object]]::new()
$app = $null; $window = $null; $failure = $null
function Shot($name) {
 $r=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
 $b=New-Object System.Drawing.Bitmap($r.Width,$r.Height); $g=[System.Drawing.Graphics]::FromImage($b)
 try { $g.CopyFromScreen($r.Location,[System.Drawing.Point]::Empty,$r.Size); $b.Save((Join-Path $out "$name.png")) } finally { $g.Dispose();$b.Dispose() }
}
function Find-Control($name) {
 $condition=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,$name)
 for($i=0;$i -lt 30;$i++) {
  $found=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
  if($found -and $found.Current.IsEnabled){return $found}
  Start-Sleep -Milliseconds 500
 }
 throw "UI control not found: $name"
}
function Click-Control($name) {
 $element=Find-Control $name
 $pattern=$null
 if($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)) { $pattern.Invoke() }
 else {
  $point=$element.GetClickablePoint()
  [SmokeMouse]::SetCursorPos([int]$point.X,[int]$point.Y) | Out-Null
  [SmokeMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[SmokeMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 }
 Start-Sleep -Milliseconds 700
}
function Dump-Controls($name) {
 $all=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
 @($all | ForEach-Object { @{name=$_.Current.Name; type=$_.Current.ControlType.ProgrammaticName; enabled=$_.Current.IsEnabled} }) | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $out "$name.json")
}
try {
 $app=Start-Process $env:CHAT3D_INSTALLED_EXE -PassThru
 for($i=0;$i -lt 30;$i++) { $app.Refresh(); if($app.MainWindowHandle -ne 0){break};Start-Sleep -Seconds 1 }
 if($app.HasExited -or $app.MainWindowHandle -eq 0){throw 'Installed app failed to create window'}
 $window=[System.Windows.Automation.AutomationElement]::FromHandle($app.MainWindowHandle)
 Start-Sleep -Seconds 4;Shot 'ui-home';Dump-Controls 'ui-home-controls'
 Find-Control '资产库' | Out-Null
 $checks.Add(@{name='installed app home renders with accessible navigation';pass=$true})
 Click-Control '资产库';Find-Control '新建资产' | Out-Null;Shot 'ui-library'
 $checks.Add(@{name='asset library opens';pass=$true})
 Click-Control '新建资产';Find-Control '导出与更多' | Out-Null;Shot 'ui-workbench'
 $checks.Add(@{name='new asset opens workbench';pass=$true})
 Click-Control '导出与更多';Click-Control '检查与备份';Find-Control '下载工作台备份' | Out-Null
 $downloads=(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path
 $folder=Join-Path $downloads 'Chat3D'
 $before=@(Get-ChildItem $folder -Filter 'chat3d-workspace-*.json' -ErrorAction SilentlyContinue | ForEach-Object FullName)
 $saved=@()
 for($repeat=0;$repeat -lt 2;$repeat++) {
  Click-Control '下载工作台备份'
  $new=$null
  for($i=0;$i -lt 30;$i++) { $new=Get-ChildItem $folder -Filter 'chat3d-workspace-*.json' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notin $before -and $_.FullName -notin $saved } | Select-Object -First 1;if($new){break};Start-Sleep -Milliseconds 500 }
  if(!$new){throw 'Native backup click did not produce a new file'}
  $data=Get-Content $new.FullName -Raw | ConvertFrom-Json
  if($data.format -ne 'chat3d-workspace-backup'){throw 'Saved backup format mismatch'}
  $saved+= $new.FullName
 }
 if($saved[0] -eq $saved[1]){throw 'Repeated export overwrote file'}
 Shot 'ui-backup-saved';Dump-Controls 'ui-backup-controls'
 $checks.Add(@{name='real backup button writes two distinct valid JSON files';pass=$true;files=$saved})
} catch { $failure=$_.Exception.Message;try{Shot 'ui-failure';if($window){Dump-Controls 'ui-failure-controls'}}catch{};Write-Host "SMOKE FAILURE: $failure" }
finally {
 @{pass=($null -eq $failure);checks=$checks;error=$failure;finishedAt=[DateTime]::UtcNow.ToString('o');limitations=@('No real model service request','Diagnostic button after generation not exercised','CI graphics differ from user GPU')} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $out 'ui-result.json')
 if($app -and !$app.HasExited){$app.CloseMainWindow() | Out-Null;Start-Sleep -Seconds 2;if(!$app.HasExited){$app.Kill()}}
}
if($failure){exit 1}
