@echo off
cd /d "%~dp0"
title Paddle Timer - LEAVE THIS WINDOW OPEN

echo.
echo  ============================================
echo    PADDLE TIMER
echo  ============================================
echo.

if not exist "package.json" (
  echo  ERROR: This file is in the wrong folder.
  echo.
  echo  START.bat must sit in the same folder as package.json,
  echo  src and public. Move it there and try again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo  First run - installing what's needed.
  echo  This takes about 30 seconds. Only happens once.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  Install failed. Is Node.js installed?
    echo  Get it from nodejs.org if not.
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo  Starting up...
echo.
echo  Opening in your browser in a moment.
echo  KEEP THIS WINDOW OPEN while you're using Paddle Timer.
echo  (Minimise it - don't close it.)
echo.

start "" http://localhost:4000
npm start

echo.
echo  Paddle Timer has stopped.
pause
