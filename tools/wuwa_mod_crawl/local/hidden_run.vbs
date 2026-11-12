' Launch a command with its console window fully hidden.
'
' Why: Task Scheduler pointing straight at a .bat makes cmd.exe create a visible
' console, so a cmd window flashes on every run (and stays up for the ~50s a real
' transfer takes). wscript.exe has no console of its own, so Run(..., 0, ...)
' starts the target hidden from the very first frame.
'
' Usage: wscript.exe //B //Nologo hidden_run.vbs "<path to .bat>"
Option Explicit

Dim sh, target, rc

If WScript.Arguments.Count = 0 Then
    WScript.Quit 2
End If

target = WScript.Arguments(0)

Set sh = CreateObject("WScript.Shell")
' 0 = hidden window, True = wait for exit (so Task Scheduler still tracks the real
' process tree -- that is what makes ExecutionTimeLimit / StopExisting work).
rc = sh.Run("""" & target & """", 0, True)
' WScript.Quit rejects negatives; a hard-killed child has a negative exit code.
If rc < 0 Then rc = 1
WScript.Quit rc
