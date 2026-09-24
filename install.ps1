# Creates a shortcut in the Startup folder so the voice agent runs at every login.
$script  = Join-Path $PSScriptRoot "agent.py"
$pythonw = (Get-Command pythonw.exe -ErrorAction Stop).Source   # no console window
$startup = [Environment]::GetFolderPath("Startup")
$lnkPath = Join-Path $startup "VoiceGreeting.lnk"

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $pythonw
$lnk.Arguments  = "`"$script`" --startup"
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.Save()

Write-Host "Installed: $lnkPath"
