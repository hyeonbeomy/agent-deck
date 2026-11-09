<#
  Agent Deck - start Claude Code in the folder the user is looking at.

  Folder, first match wins:
    1. the foreground window, if it is a File Explorer window: its current folder, or the one
       selected sub-folder when exactly one item is selected and it is a folder. Windows 11 tabs
       share one window handle, so the selected tab is matched through UI Automation.
    2. the Explorer window under the mouse cursor (same rules)
    3. the desktop (foreground or under the cursor) -> the Desktop folder
    4. -DefaultFolder
    5. the user's home folder
  Virtual locations (Quick access, This PC, network root) have no filesystem path and are skipped.

  WSL only auto-mounts fixed local drives. When WSL cannot translate the folder (wslpath fails:
  a NAS share, a mapped network drive, Google Drive's virtual drive, ...), the drive or share is
  mounted first, as root and without a password prompt:
      drive  X:\...            ->  mount -t drvfs X: /mnt/x
      share  \\server\share\.. ->  mount -t drvfs \\server\share /mnt/server-share
  The mount lasts until WSL shuts down.

  Then a Windows Terminal tab (or window with -NewWindow) runs WSL in that folder and starts
  claude:  wt.exe -w 0 new-tab --title "claude: <name>" [-p <profile>]
             wsl.exe [-d <distro>] --cd <linux path> -- bash -lic claude
  -KeepShell leaves the shell open after claude exits. Without wt.exe, wsl.exe is started in a
  plain console window.

  -DryRun prints the folder, the mount that would be made and the command, and starts nothing.
  Exit codes: 0 = started, 1 = could not start (folder unreachable in WSL, mount failed).
  Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
#>
param(
    [string]$DefaultFolder = "",
    [string]$Distro = "",
    [string]$TerminalProfile = "",
    [switch]$NewWindow,
    [switch]$KeepShell,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
. "$PSScriptRoot\agent-deck-win.ps1"

# ---------- which folder ----------

function Test-Folder([string]$p) {
    if (-not $p) { return $false }
    if ($p.StartsWith("::")) { return $false }
    return (Test-Path -LiteralPath $p -PathType Container)
}

# Name of the selected tab of an Explorer window (Windows 11 tabs), or "".
function Get-ActiveTabName([IntPtr]$hwnd) {
    try {
        Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
        $AE = [System.Windows.Automation.AutomationElement]
        $root = $AE::FromHandle($hwnd)
        $tabCond = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
        foreach ($t in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCond)) {
            try {
                $sel = $t.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                if ($sel.Current.IsSelected) { return [string]$t.Current.Name }
            } catch { }
        }
    } catch { }
    return ""
}

# Folder shown in the Explorer window $hwnd (or its one selected sub-folder), or "".
function Get-ExplorerFolder([IntPtr]$hwnd) {
    $shell = New-Object -ComObject Shell.Application
    $views = @()
    foreach ($w in @($shell.Windows())) {
        try {
            if ([IntPtr]$w.HWND -ne $hwnd) { continue }
            if ($w.FullName -notlike "*\explorer.exe") { continue }
            $doc = $w.Document
            $views += [pscustomobject]@{
                Name     = [string]$w.LocationName
                Path     = [string]$doc.Folder.Self.Path
                Selected = @($doc.SelectedItems())
            }
        } catch { }
    }
    if ($views.Count -eq 0) { return "" }
    $view = $views[0]
    if ($views.Count -gt 1) {
        $tab = Get-ActiveTabName $hwnd
        if ($tab) {
            $m = $views | Where-Object { $_.Name -eq $tab } | Select-Object -First 1
            if ($m) { $view = $m }
        }
    }
    if ($view.Selected.Count -eq 1) {
        $item = $view.Selected[0]
        if ($item.IsFolder -and (Test-Folder ([string]$item.Path))) { return [string]$item.Path }
    }
    if (Test-Folder $view.Path) { return $view.Path }
    return ""
}

function Resolve-FolderFromWindow([IntPtr]$hwnd) {
    if ($hwnd -eq [IntPtr]::Zero) { return "" }
    $cls = [AgentDeckWin]::ClassName($hwnd)
    if ($cls -eq "CabinetWClass") { return Get-ExplorerFolder $hwnd }
    if ($cls -eq "Progman" -or $cls -eq "WorkerW") { return [Environment]::GetFolderPath("Desktop") }
    return ""
}

# ---------- WSL ----------

# Quote one command-line argument the way CommandLineToArgvW expects.
function Quote-Arg([string]$s) {
    if ($s -eq "") { return '""' }
    if ($s -notmatch '[\s"]') { return $s }
    $t = $s -replace '"', '\"'
    if ($t.EndsWith('\')) { $t = $t + '\' }
    return '"' + $t + '"'
}

$wslBase = @()
if ($Distro) { $wslBase = @("-d", $Distro) }

# Run wsl.exe without a window; returns exit code and (UTF-8) output. Arguments are passed as
# they are, so Windows paths and non-ASCII names survive.
function Invoke-Wsl([string[]]$wslArguments) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "wsl.exe"
    $psi.Arguments = (@($wslBase + $wslArguments) | ForEach-Object { Quote-Arg $_ }) -join " "
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $p = [System.Diagnostics.Process]::Start($psi)
    $errTask = $p.StandardError.ReadToEndAsync()
    $out = $p.StandardOutput.ReadToEnd()
    $p.WaitForExit()
    return [pscustomobject]@{ Code = $p.ExitCode; Out = $out.Trim(); Err = ($errTask.Result -replace [string][char]0, "").Trim() }
}

# Where a folder WSL cannot translate would be mounted: source, mount point, linux path.
function Get-MountPlan([string]$path) {
    $sep = [char]92
    if ($path.StartsWith("\\")) {
        $parts = @($path.TrimStart($sep).Split($sep) | Where-Object { $_ })
        if ($parts.Count -lt 2) { return $null }
        $source = "\\" + $parts[0] + "\" + $parts[1]
        $slug = ($parts[0] + "-" + $parts[1]).ToLowerInvariant() -replace "[^a-z0-9._-]", "-"
        if ($slug -notmatch "[a-z0-9]") { $slug = "unc-" + [Math]::Abs($source.ToLowerInvariant().GetHashCode()).ToString("x") }
        $point = "/mnt/" + $slug
        $rest = @($parts | Select-Object -Skip 2)
    } elseif ($path -match "^([A-Za-z]):") {
        $source = $matches[1].ToUpperInvariant() + ":"
        $point = "/mnt/" + $matches[1].ToLowerInvariant()
        $rest = @($path.Substring(2).Split($sep) | Where-Object { $_ })
    } else {
        return $null
    }
    $linux = $point
    if ($rest.Count -gt 0) { $linux = $point + "/" + ($rest -join "/") }
    return [pscustomobject]@{ Source = $source; Point = $point; Linux = $linux }
}

# Mount the plan's source in WSL (as root) unless it is mounted already. Returns "" or a problem.
function Mount-InWsl($plan) {
    $ids = "uid=" + (Invoke-Wsl @("-e", "id", "-u")).Out + ",gid=" + (Invoke-Wsl @("-e", "id", "-g")).Out
    $r = Invoke-Wsl @("-u", "root", "-e", "mkdir", "-p", $plan.Point)
    if ($r.Code -ne 0) { return "could not create $($plan.Point) in WSL: $($r.Err)" }
    if ((Invoke-Wsl @("-u", "root", "-e", "mountpoint", "-q", $plan.Point)).Code -ne 0) {
        $r = Invoke-Wsl @("-u", "root", "-e", "mount", "-t", "drvfs", $plan.Source, $plan.Point, "-o", $ids)
        if ($r.Code -ne 0) { return "mount -t drvfs $($plan.Source) $($plan.Point) failed: $($r.Err)" }
    }
    if ((Invoke-Wsl @("-e", "test", "-d", $plan.Linux)).Code -ne 0) {
        return "$($plan.Linux) is not reachable in WSL after mounting $($plan.Source)"
    }
    return ""
}

# ---------- main ----------

$source = "focused"
$fg = [AgentDeckWin]::Foreground()
$folder = Resolve-FolderFromWindow $fg
if (-not $folder) {
    $under = [AgentDeckWin]::WindowUnderCursor()
    if ($under -ne $fg) {
        $folder = Resolve-FolderFromWindow $under
        $source = "cursor"
    }
}
if (-not $folder -and (Test-Folder $DefaultFolder)) { $folder = $DefaultFolder; $source = "default" }
if (-not $folder) { $folder = $env:USERPROFILE; $source = "home" }
if ($folder.Length -gt 3) { $folder = $folder.TrimEnd([char]92) }

$note = ""
$translated = Invoke-Wsl @("-e", "wslpath", "-u", $folder)
if ($translated.Code -eq 0 -and $translated.Out) {
    $linux = $translated.Out
} else {
    $plan = Get-MountPlan $folder
    if (-not $plan) {
        [Console]::Error.WriteLine("WSL cannot open $folder and it is neither a drive nor a network share")
        exit 1
    }
    if ($DryRun) {
        $note = " would-mount=$($plan.Source)->$($plan.Point)"
    } else {
        $problem = Mount-InWsl $plan
        if ($problem) {
            [Console]::Error.WriteLine($problem)
            exit 1
        }
        $note = " mounted=$($plan.Source)->$($plan.Point)"
    }
    $linux = $plan.Linux
}

$name = Split-Path -Path $folder -Leaf
if (-not $name) { $name = $folder }
$title = "claude: $name"
# No semicolons: Windows Terminal treats ';' as its own command separator.
$inner = "claude"
if ($KeepShell) { $inner = "claude || true && exec bash -i" }

$wslArgs = @($wslBase + @("--cd", $linux, "--", "bash", "-lic", $inner)) | ForEach-Object { Quote-Arg $_ }

Write-Output "folder=$folder source=$source wsl=$linux$note"
$wt = Get-Command wt.exe -ErrorAction SilentlyContinue
if ($wt) {
    $window = "0"
    if ($NewWindow) { $window = "new" }
    $wtArgs = @("-w", $window, "new-tab", "--title", (Quote-Arg $title))
    if ($TerminalProfile) { $wtArgs += @("-p", (Quote-Arg $TerminalProfile)) }
    $wtArgs += @("wsl.exe") + $wslArgs
    if ($DryRun) { Write-Output ("wt.exe " + ($wtArgs -join " ")); exit 0 }
    Start-Process -FilePath $wt.Source -ArgumentList $wtArgs
} else {
    if ($DryRun) { Write-Output ("wsl.exe " + ($wslArgs -join " ")); exit 0 }
    Start-Process -FilePath "wsl.exe" -ArgumentList $wslArgs
}

# Bring the new tab forward (best effort): it carries our title until Claude Code renames it.
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 150
    if ((Try-Focus $title $true) -eq 0) { break }
}
exit 0
