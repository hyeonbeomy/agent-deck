<#
  Agent Deck - bring a session's terminal to the front (Windows).

  Search order:
    1. any visible top-level window whose title contains -Match (the unique token the hook
       writes into the terminal title, e.g. "[cc:1a2b3c4d]")
    2. a Windows Terminal tab whose title contains -Match (UI Automation, selects the tab)
    3. -ProcessId: walk up the parent chain of the agent's process (from ~/.claude/sessions)
       and focus the first ancestor that owns a visible window (Windows Terminal, conhost,
       mintty, VS Code, ...). Finds the right window, not necessarily the right tab.
    4. the first two steps with -Fallback (project name), limited to terminal windows

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
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
    [DllImport("user32.dll")] private static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    private static readonly string[] TerminalClasses = {
        "ConsoleWindowClass",            // classic cmd / conhost window
        "CASCADIA_HOSTING_WINDOW_CLASS", // Windows Terminal
        "mintty",                        // Git Bash / WSLtty
        "VirtualConsoleClass"            // ConEmu
    };

    private static bool IsTerminal(IntPtr h) {
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

    // First visible, titled top-level window owned by the process.
    public static IntPtr FindByProcess(uint pid) {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate (IntPtr h, IntPtr l) {
            if (!IsWindowVisible(h)) return true;
            if (GetWindowTextLength(h) == 0) return true;
            uint owner;
            GetWindowThreadProcessId(h, out owner);
            if (owner != pid) return true;
            found = h;
            return false;
        }, IntPtr.Zero);
        return found;
    }

    public static bool Focus(IntPtr h) {
        if (h == IntPtr.Zero) return false;
        if (IsIconic(h)) ShowWindow(h, 9); // SW_RESTORE
        if (SetForegroundWindow(h) && GetForegroundWindow() == h) return true;

        // Windows only lets the foreground thread change focus, so borrow its input queue.
        uint ignored;
        uint fg = GetWindowThreadProcessId(GetForegroundWindow(), out ignored);
        uint me = GetCurrentThreadId();
        if (fg != 0 && fg != me) {
            AttachThreadInput(me, fg, true);
            BringWindowToTop(h);
            SetForegroundWindow(h);
            AttachThreadInput(me, fg, false);
        }
        if (GetForegroundWindow() == h) return true;

        // Last resort: a synthetic Alt tap lifts the foreground lock.
        keybd_event(0x12, 0, 0, UIntPtr.Zero);
        keybd_event(0x12, 0, 2, UIntPtr.Zero);
        SetForegroundWindow(h);
        return GetForegroundWindow() == h;
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

# The agent itself (claude.exe) has no window; its terminal is somewhere up the parent chain:
# claude.exe -> cmd/powershell/bash/wsl -> WindowsTerminal.exe, or -> conhost for a classic console.
function Try-FocusProcess([int]$procId) {
    if ($procId -le 0) { return 1 }
    $parents = @{}
    try {
        foreach ($p in Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId) {
            $parents[[int]$p.ProcessId] = [int]$p.ParentProcessId
        }
    } catch {
        return 1
    }
    $id = $procId
    for ($depth = 0; $depth -lt 16 -and $id -gt 0; $depth++) {
        $h = [AgentDeckWin]::FindByProcess([uint32]$id)
        if ($h -ne [IntPtr]::Zero) {
            if ([AgentDeckWin]::Focus($h)) { return 0 }
            return 2
        }
        if (-not $parents.ContainsKey($id)) { break }
        $next = $parents[$id]
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
    $result = Try-FocusProcess $ProcessId
}
if ($result -eq 1 -and $Fallback) {
    $result = Try-Focus $Fallback $true
}
exit $result
