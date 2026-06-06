@echo off
setlocal

set "APP_DIR=%~dp0olympia-wallet-tool"
set "URL=http://localhost:4317/"
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%APP_DIR%\server.js" (
  echo No se encontro la carpeta olympia-wallet-tool.
  pause
  exit /b 1
)

if exist "%BUNDLED_NODE%" (
  set "NODE_EXE=%BUNDLED_NODE%"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo No se encontro Node.js en esta computadora.
    echo.
    echo Instala Node.js una sola vez desde:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
  )
  set "NODE_EXE=node"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$port=4317; if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { Start-Process -FilePath '%NODE_EXE%' -ArgumentList 'server.js' -WorkingDirectory '%APP_DIR%' -WindowStyle Hidden }"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2"
start "" "%URL%"

endlocal
