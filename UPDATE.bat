@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Paddle Timer - Update

echo.
echo  ============================================
echo    PADDLE TIMER - UPDATE
echo  ============================================
echo.

if not exist "package.json" (
  echo  ERROR: This file is in the wrong folder.
  echo  UPDATE.bat must sit next to package.json, src and public.
  echo.
  pause
  exit /b 1
)

REM --- Find the newest paddle-timer zip in Downloads ---
REM Repeated downloads become paddle-timer(1).zip, (2).zip and so on,
REM so take whichever is newest by date rather than assuming a name.
set "DL=%USERPROFILE%\Downloads"
set "NEWEST="
for /f "delims=" %%F in ('dir /b /o-d "%DL%\paddle-timer*.zip" 2^>nul') do (
  if not defined NEWEST set "NEWEST=%DL%\%%F"
)

if not defined NEWEST (
  echo  No paddle-timer zip found in your Downloads folder.
  echo.
  echo  Download the new zip first, then run this again.
  echo  ^(Looked in: %DL%^)
  echo.
  pause
  exit /b 1
)

echo  Using: !NEWEST!
echo.

REM --- Back up the database before touching anything ---
REM Your meets, draws and results live in data\db.json. This update
REM never overwrites the data folder, but a backup costs nothing.
if exist "data\db.json" (
  copy /y "data\db.json" "data\db.backup.json" >nul
  echo  Backed up your data to data\db.backup.json
)

REM --- Unpack to a temporary folder ---
set "TMPDIR=%TEMP%\paddle-timer-update"
if exist "!TMPDIR!" rmdir /s /q "!TMPDIR!"
mkdir "!TMPDIR!"

echo  Unpacking...
powershell -NoProfile -Command "Expand-Archive -LiteralPath '!NEWEST!' -DestinationPath '!TMPDIR!' -Force" 2>nul
if errorlevel 1 (
  echo.
  echo  Could not unpack the zip. It may still be downloading,
  echo  or the download didn't finish. Try again in a moment.
  echo.
  pause
  exit /b 1
)

REM --- The zip contains a paddle-timer folder inside it ---
set "SRC=!TMPDIR!\paddle-timer"
if not exist "!SRC!\package.json" (
  if exist "!TMPDIR!\package.json" (
    set "SRC=!TMPDIR!"
  ) else (
    echo.
    echo  Unexpected zip contents - couldn't find package.json inside.
    echo.
    pause
    exit /b 1
  )
)

REM --- Copy code only. The data folder is deliberately NOT touched. ---
echo  Updating program files...
xcopy "!SRC!\src" "src" /e /i /y /q >nul
xcopy "!SRC!\public" "public" /e /i /y /q >nul
copy /y "!SRC!\server.js" "server.js" >nul
copy /y "!SRC!\package.json" "package.json" >nul
if exist "!SRC!\README.md" copy /y "!SRC!\README.md" "README.md" >nul

REM --- Only reinstall if the dependency list actually changed ---
findstr /c:"exceljs" package.json >nul 2>&1
if not errorlevel 1 (
  if not exist "node_modules\exceljs" (
    echo  New dependency detected - installing...
    call npm install
  )
)

rmdir /s /q "!TMPDIR!" 2>nul

echo.
echo  ============================================
echo    UPDATED
echo  ============================================
echo.
echo  Your meets and results are untouched.
echo.
echo  Now: close the black Paddle Timer window if it's
echo  still open, then double-click START.bat
echo.
pause
