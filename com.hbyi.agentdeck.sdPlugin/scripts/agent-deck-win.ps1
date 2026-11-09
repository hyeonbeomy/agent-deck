<#
  Agent Deck - shared Windows helpers, dot-sourced by the other scripts in this folder:
    . "$PSScriptRoot\agent-deck-win.ps1"

  [AgentDeckWin]  window lookup (by title, by process), focusing, console title of a process,
                  foreground window, window under the mouse cursor, window class name
  Try-Focus       focus a window whose title contains a needle, else a Windows Terminal tab
  Get-TitleNeedle strip Claude Code's spinner glyph from a console title

  Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
#>

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class AgentDeckWin {
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }

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
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
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

    public static string ClassName(IntPtr h) {
        StringBuilder sb = new StringBuilder(256);
        GetClassName(h, sb, sb.Capacity);
        return sb.ToString();
    }

    public static bool IsTerminal(IntPtr h) {
        string cls = ClassName(h);
        foreach (string t in TerminalClasses) {
            if (cls == t) return true;
        }
        return false;
    }

    public static IntPtr Foreground() {
        return GetForegroundWindow();
    }

    // Top-level window under the mouse cursor (IntPtr.Zero if none).
    public static IntPtr WindowUnderCursor() {
        POINT p;
        if (!GetCursorPos(out p)) return IntPtr.Zero;
        IntPtr h = WindowFromPoint(p);
        if (h == IntPtr.Zero) return h;
        IntPtr root = GetAncestor(h, 2); // GA_ROOT
        return root == IntPtr.Zero ? h : root;
    }

    public static void Show(IntPtr h) {
        ShowWindow(h, 9); // SW_RESTORE
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

# 0 = focused, 1 = no window or tab with that title, 2 = found but Windows refused.
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
