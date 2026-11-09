<#
  Agent Deck - bring the Claude desktop app to the front; start it when it is not running.

  1. A visible window of the desktop app (processes named claude whose image lives in the
     Store package folder "WindowsApps\Claude_*" or the per-user installer folder
     "AnthropicClaude"; the CLI is also claude.exe but has no window) -> focus it.
  2. Otherwise start the app: Store package (shell:AppsFolder\<family>!Claude), then
     %LOCALAPPDATA%\AnthropicClaude\claude.exe, then the claude:// protocol handler. The app
     is single-instance, so this also brings back a window that was hidden in the tray.
     Wait up to 10 s for a visible window; if the window stays hidden, show it, then focus.

  -DryRun prints what would happen instead of focusing or starting anything.
  Exit codes: 0 = in front, 1 = app not found / no window appeared, 2 = Windows refused to focus.
  Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
#>
param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\agent-deck-win.ps1"

function Get-ClaudeAppProcesses {
    Get-Process -Name claude -ErrorAction SilentlyContinue | Where-Object {
        $path = $null
        try { $path = $_.Path } catch { }
        $path -and (($path -like "*\WindowsApps\Claude_*") -or ($path -like "*\AnthropicClaude\*"))
    }
}

function Find-ClaudeAppWindow {
    foreach ($p in Get-ClaudeAppProcesses) {
        $h = [AgentDeckWin]::FindByProcess([uint32]$p.Id)
        if ($h -ne [IntPtr]::Zero) { return $h }
    }
    return [IntPtr]::Zero
}

function Get-LaunchTarget {
    $pkg = Get-AppxPackage -Name Claude -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pkg) { return "shell:AppsFolder\$($pkg.PackageFamilyName)!Claude" }
    $exe = Join-Path $env:LOCALAPPDATA "AnthropicClaude\claude.exe"
    if (Test-Path -LiteralPath $exe) { return $exe }
    $handler = Get-ItemProperty "HKCU:\Software\Classes\claude\shell\open\command" -ErrorAction SilentlyContinue
    if ($handler) { return "claude://" }
    return $null
}

$h = Find-ClaudeAppWindow
if ($h -ne [IntPtr]::Zero) {
    if ($DryRun) { Write-Output "window=$h (would focus)"; exit 0 }
    if ([AgentDeckWin]::Focus($h)) { Write-Output "focused"; exit 0 }
    exit 2
}

$target = Get-LaunchTarget
if (-not $target) {
    [Console]::Error.WriteLine("Claude desktop app is not installed (no Store package, AnthropicClaude folder or claude:// handler)")
    exit 1
}
if ($DryRun) { Write-Output "launch=$target"; exit 0 }
Start-Process $target

for ($i = 0; $i -lt 50; $i++) {
    Start-Sleep -Milliseconds 200
    $h = Find-ClaudeAppWindow
    if ($h -ne [IntPtr]::Zero) { break }
}
if ($h -eq [IntPtr]::Zero) {
    # The app may keep its main window hidden (closed to the tray): show it ourselves.
    foreach ($p in Get-ClaudeAppProcesses) {
        if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
            [AgentDeckWin]::Show($p.MainWindowHandle)
            $h = $p.MainWindowHandle
            break
        }
    }
}
if ($h -eq [IntPtr]::Zero) {
    [Console]::Error.WriteLine("Claude app was started but no window appeared within 10 s")
    exit 1
}
if ([AgentDeckWin]::Focus($h)) { Write-Output "started"; exit 0 }
exit 2
