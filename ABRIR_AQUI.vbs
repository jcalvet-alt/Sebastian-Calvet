Set oShell = CreateObject("WScript.Shell")
Set oFS = CreateObject("Scripting.FileSystemObject")
carpeta = oFS.GetParentFolderName(WScript.ScriptFullName)
cmd = "cmd.exe /K """ & carpeta & "\ABRIR.bat"""
oShell.Run cmd, 1, False
