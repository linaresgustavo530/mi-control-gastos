@echo off
set "APP_DIR=%~dp0"
set "CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

cd /d "%APP_DIR%"

if exist "%CODEX_NODE%" (
  "%CODEX_NODE%" server.js
) else (
  node server.js
)

pause
