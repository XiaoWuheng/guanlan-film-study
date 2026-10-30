Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
base = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run Chr(34) & base & "\runtime\node.exe" & Chr(34) & " " & Chr(34) & base & "\desktop.mjs" & Chr(34), 0, False
