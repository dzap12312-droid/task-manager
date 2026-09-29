@echo off
cd /d "%~dp0"

if not exist "node_modules" (
  echo First run: installing required files. This may take a few minutes...
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed. Make sure Node.js is installed: https://nodejs.org
    pause
    exit /b 1
  )
)

call npm start
if errorlevel 1 (
  echo.
  echo An error occurred while running the app.
  pause
)
