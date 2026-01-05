param(
    [Parameter(Mandatory=$true)]
    [string]$Action,

    [int]$X = 0,
    [int]$Y = 0
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class MouseControl {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    public const int MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const int MOUSEEVENTF_LEFTUP = 0x0004;
    public const int MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const int MOUSEEVENTF_RIGHTUP = 0x0010;
    public const int MOUSEEVENTF_WHEEL = 0x0800;
}
"@

switch ($Action) {
    "move" {
        [MouseControl]::SetCursorPos($X, $Y)
        Write-Output "OK"
    }
    "click" {
        [MouseControl]::mouse_event([MouseControl]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        Start-Sleep -Milliseconds 50
        [MouseControl]::mouse_event([MouseControl]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        Write-Output "OK"
    }
    "rightclick" {
        [MouseControl]::mouse_event([MouseControl]::MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
        Start-Sleep -Milliseconds 50
        [MouseControl]::mouse_event([MouseControl]::MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
        Write-Output "OK"
    }
    "getpos" {
        $point = New-Object MouseControl+POINT
        [MouseControl]::GetCursorPos([ref]$point)
        Write-Output "$($point.X),$($point.Y)"
    }
    default {
        Write-Error "Unknown action: $Action"
        exit 1
    }
}
