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

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class AgentDeckWin {
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder text, int max);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern void SwitchToThisWindow(IntPtr hWnd, bool altTab);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
    [DllImport("user32.dll")] private static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("kernel32.dll")] private static extern bool FreeConsole();
    [DllImport("kernel32.dll")] private static extern bool AttachConsole(uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern uint GetConsoleTitle(StringBuilder text, uint max);

    private static readonly string[] TerminalClasses = {
        "ConsoleWindowClass",            // classic cmd / conhost window
        "CASCADIA_HOSTING_WINDOW_CLASS", // Windows Terminal
        "mintty",                        // Git Bash / WSLtty
        "VirtualConsoleClass"            // ConEmu
    };

    public static bool IsTerminal(IntPtr h) {
        StringBuilder sb = new StringBuilder(256);
        GetClassName(h, sb, sb.Capacity);
        string cls = sb.ToString();
        foreach (string t in TerminalClasses) {
            if (cls == t) return true;
        }
        return false;
    }

    public static IntPtr FindByTitle(string needle, bool terminalsOnly) {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate (IntPtr h, IntPtr l) {
            if (!IsWindowVisible(h)) return true;
            int len = GetWindowTextLength(h);
            if (len == 0) return true;
            StringBuilder sb = new StringBuilder(len + 1);
            GetWindowText(h, sb, sb.Capacity);
            if (sb.ToString().IndexOf(needle, StringComparison.OrdinalIgnoreCase) < 0) return true;
            if (terminalsOnly && !IsTerminal(h)) return true;
            found = h;
            return false;
        }, IntPtr.Zero);
        return found;
    }

    // Visible, titled top-level window owned by the process. A terminal window wins over any
    // other window of the same process (EnumWindows order is z-order, top first).
    public static IntPtr FindByProcess(uint pid) {
        IntPtr first = IntPtr.Zero;
        IntPtr terminal = IntPtr.Zero;
        EnumWindows(delegate (IntPtr h, IntPtr l) {
            if (!IsWindowVisible(h)) return true;
            if (GetWindowTextLength(h) == 0) return true;
            uint owner;
            GetWindowThreadProcessId(h, out owner);
            if (owner != pid) return true;
            if (first == IntPtr.Zero) first = h;
            if (IsTerminal(h)) { terminal = h; return false; }
            return true;
        }, IntPtr.Zero);
        return terminal != IntPtr.Zero ? terminal : first;
    }

    // Title of the console the process is attached to; "" when it has none. Nothing may be
    // written to the console while attached - it is the user's terminal.
    public static string ConsoleTitle(uint pid) {
        FreeConsole();
        if (!AttachConsole(pid)) return "";
        StringBuilder sb = new StringBuilder(1024);
        uint n = GetConsoleTitle(sb, (uint)sb.Capacity);
        FreeConsole();
        return n == 0 ? "" : sb.ToString();
    }

    // The foreground switch is asynchronous; give it a moment before judging.
    private static bool WaitForeground(IntPtr h) {
        for (int i = 0; i < 15; i++) {
            if (GetForegroundWindow() == h) return true;
            Thread.Sleep(20);
        }
        return false;
    }

    public static bool Focus(IntPtr h) {
        if (h == IntPtr.Zero) return false;
        if (IsIconic(h)) ShowWindow(h, 9); // SW_RESTORE
        if (GetForegroundWindow() == h) return true;

        SetForegroundWindow(h);
        if (WaitForeground(h)) return true;

        // Only the foreground thread may change the foreground window, so borrow its input queue.
        uint ignored;
        uint fg = GetWindowThreadProcessId(GetForegroundWindow(), out ignored);
        uint me = GetCurrentThreadId();
        if (fg != 0 && fg != me) {
            AttachThreadInput(me, fg, true);
            BringWindowToTop(h);
            SetForegroundWindow(h);
            AttachThreadInput(me, fg, false);
            if (WaitForeground(h)) return true;
        }

        // A synthetic Alt tap counts as input from this process and lifts the foreground lock.
        keybd_event(0x12, 0, 0, UIntPtr.Zero);
        keybd_event(0x12, 0, 2, UIntPtr.Zero);
        SetForegroundWindow(h);
        if (WaitForeground(h)) return true;

        // Last resort: the call Alt+Tab uses.
        SwitchToThisWindow(h, true);
        return WaitForeground(h);
    }
}
"@

# Windows Terminal hosts many tabs in one window, and only the active tab's title is the
# window title. UI Automation exposes each tab (name = tab title), so a background tab can
# still be found and selected.
function Select-TerminalTab([string]$needle) {
    try {
        Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    } catch {
        return 1
    }
    $AE = [System.Windows.Automation.AutomationElement]
    $classCond = New-Object System.Windows.Automation.PropertyCondition($AE::ClassNameProperty, "CASCADIA_HOSTING_WINDOW_CLASS")
    $tabCond = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
    $windows = $AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $classCond)
    foreach ($w in $windows) {
        $tabs = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCond)
        foreach ($t in $tabs) {
            $name = $t.Current.Name
            if (-not $name -or $name.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
            try {
                $sel = $t.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                $sel.Select()
            } catch { }
            $hwnd = [IntPtr]$w.Current.NativeWindowHandle
            if ([AgentDeckWin]::Focus($hwnd)) { return 0 }
            return 2
        }
    }
    return 1
}

function Try-Focus([string]$needle, [bool]$terminalsOnly) {
    $h = [AgentDeckWin]::FindByTitle($needle, $terminalsOnly)
    if ($h -ne [IntPtr]::Zero) {
        if ([AgentDeckWin]::Focus($h)) { return 0 }
        return 2
    }
    return Select-TerminalTab $needle
}

# Claude Code titles its console "<spinner> <summary>" and the spinner glyph keeps changing
# while it works, so match on the text after a leading one- or two-character symbol.
function Get-TitleNeedle([string]$title) {
    $t = $title.Trim()
    if ($t -match '^(\S{1,2})\s+(.+)$') {
        $head = $matches[1]
        $rest = $matches[2].Trim()
        if ($rest.Length -ge 3 -and $head -notmatch '[\p{L}\p{N}]') { return $rest }
    }
    return $t
}

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
