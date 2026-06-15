!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Closing running Yole processes before installing..."
  nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -Command "$$installDir = '$INSTDIR'; if (Test-Path -LiteralPath $$installDir) { $$pythonDir = Join-Path $$installDir 'python'; Get-CimInstance Win32_Process | Where-Object { ($$_.Name -eq 'Yole.exe' -and $$_.ExecutablePath -like ($$installDir + '*')) -or ($$_.Name -eq 'python.exe' -and $$_.ExecutablePath -like ($$pythonDir + '*')) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue } }"`
  Sleep 2000
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Creating Yole desktop shortcut..."
  Call CreateOrUpdateDesktopShortcut

  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    DetailPrint "Launching Yole..."
    nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Closing running Yole processes before uninstalling..."
  nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -Command "$$installDir = '$INSTDIR'; if (Test-Path -LiteralPath $$installDir) { $$pythonDir = Join-Path $$installDir 'python'; Get-CimInstance Win32_Process | Where-Object { $$path = $$_.ExecutablePath; $$path -and (($$_.Name -eq 'Yole.exe' -and $$path -like ($$installDir + '*')) -or (($$_.Name -eq 'python.exe' -or $$_.Name -eq 'pythonw.exe') -and $$path -like ($$pythonDir + '*'))) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue } }"`
  Sleep 2000
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    DetailPrint "Cleaning leftover Yole runtime files..."
    nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -Command "$$installDir = '$INSTDIR'; if (Test-Path -LiteralPath $$installDir) { foreach ($$name in @('managed-ga','python','runner')) { $$target = Join-Path $$installDir $$name; if (Test-Path -LiteralPath $$target) { Remove-Item -LiteralPath $$target -Recurse -Force -ErrorAction SilentlyContinue } }; $$remaining = @(Get-ChildItem -LiteralPath $$installDir -Force -ErrorAction SilentlyContinue); if ($$remaining.Count -eq 0) { Remove-Item -LiteralPath $$installDir -Force -ErrorAction SilentlyContinue } }"`
  ${EndIf}

  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    DetailPrint "Cleaning Yole app data..."
    nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -Command "$$paths = @((Join-Path $$env:APPDATA 'app.yole'), (Join-Path $$env:LOCALAPPDATA 'app.yole')); foreach ($$path in $$paths) { if (Test-Path -LiteralPath $$path) { Remove-Item -LiteralPath $$path -Recurse -Force -ErrorAction SilentlyContinue } }"`
  ${EndIf}
!macroend
