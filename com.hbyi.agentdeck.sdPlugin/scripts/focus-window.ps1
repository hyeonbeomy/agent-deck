<#
  Agent Deck - bring a session's terminal to the front (Windows).

  Search order:
    1. -Match: a visible top-level window whose title contains the token the hook writes into
       the terminal title (e.g. "[cc:1a2b3c4d]"), then a Windows Terminal tab with that title
       (UI Automation selects the tab).
    2. -ProcessId (the agent's pid from ~/.claude/sessions):
       a. the title of the console the agent is attached to (AttachConsole + GetConsoleTitle).
          Claude Code titles it "<spinner> <conversation summary>", and Windows Terminal shows
          the same text as the tab title, so the exact tab is found - also when the console was
          started from Explorer/Start and only reached Windows Terminal through console
          delegation, where the process tree never leads to WindowsTerminal.exe.
       b. the parent chain of the process: the first ancestor that owns a visible, titled
          window (WindowsTerminal.exe, conhost, mintty, VS Code, ...). Shell and system
          processes (explorer.exe, svchost.exe, ...) are skipped. Finds the window, not the tab.
    3. -Fallback: the project name in a terminal window title (Codex, best effort).

  Exit codes: 0 = focused, 1 = not found, 2 = found but Windows refused to focus it.
  Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
#>
param(
    [string]$Match = "",
    [int]$ProcessId = 0,
    [string]$Fallback = ""
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\agent-deck-win.ps1"

# Processes that own windows but never the agent's terminal. The walk stops at the shell.
$SkipProcesses = @(
    "explorer.exe", "svchost.exe", "services.exe", "wininit.exe", "winlogon.exe", "csrss.exe",
    "smss.exe", "userinit.exe", "sihost.exe", "runtimebroker.exe", "applicationframehost.exe",
    "system", "system idle process"
)

function Get-ProcessMap {
    $parents = @{}
    $names = @{}
    foreach ($p in Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId, Name) {
        $parents[[int]$p.ProcessId] = [int]$p.ParentProcessId
        $names[[int]$p.ProcessId] = [string]$p.Name
    }
    return @{ parents = $parents; names = $names }
}

# The agent itself (claude.exe) has no window; its terminal is somewhere up the parent chain:
# claude.exe -> cmd/powershell/bash/wsl -> WindowsTerminal.exe, or -> conhost for a classic console.
function Try-FocusProcess([int]$procId, $map) {
    if ($procId -le 0) { return 1 }
    $id = $procId
    for ($depth = 0; $depth -lt 16 -and $id -gt 0; $depth++) {
        $name = ""
        if ($map.names.ContainsKey($id)) { $name = $map.names[$id].ToLowerInvariant() }
        if ($SkipProcesses -contains $name) { break }
        $h = [AgentDeckWin]::FindByProcess([uint32]$id)
        if ($h -ne [IntPtr]::Zero) {
            if ([AgentDeckWin]::Focus($h)) { return 0 }
            return 2
        }
        if (-not $map.parents.ContainsKey($id)) { break }
        $next = $map.parents[$id]
        if ($next -eq $id) { break }
        $id = $next
    }
    return 1
}

$result = 1
if ($Match) {
    $result = Try-Focus $Match $false
}
if ($result -eq 1 -and $ProcessId -gt 0) {
    $title = [AgentDeckWin]::ConsoleTitle([uint32]$ProcessId)
    if ($title) {
        $result = Try-Focus (Get-TitleNeedle $title) $true
    }
    if ($result -eq 1) {
        $map = $null
        try { $map = Get-ProcessMap } catch { $map = $null }
        if ($map) { $result = Try-FocusProcess $ProcessId $map }
    }
}
if ($result -eq 1 -and $Fallback) {
    $result = Try-Focus $Fallback $true
}
exit $result
