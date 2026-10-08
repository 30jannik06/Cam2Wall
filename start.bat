@echo off
title Cam2Wall
cd /d "%~dp0"

if not exist bin\go2rtc.exe (
    echo go2rtc not found - downloading...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1"
    if not exist bin\go2rtc.exe ( echo Download failed. & pause & exit /b 1 )
)
if not exist config\go2rtc.yaml (
    copy config\go2rtc.example.yaml config\go2rtc.yaml >nul
    echo config\go2rtc.yaml created - enter your camera URLs there, then start again.
    notepad config\go2rtc.yaml
    pause & exit /b 1
)
if not exist certs\cert.pem powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-cert.ps1"

REM Stop a previous instance
taskkill /F /IM go2rtc.exe >nul 2>&1

set CFG=-config config\go2rtc.yaml
if exist config\tls.yaml set CFG=%CFG% -config config\tls.yaml

echo.
echo ====================================================
echo  Dashboard on this PC:  http://localhost:1984
echo  On your phone ^(same Wi-Fi^), use one of these IPs:
ipconfig | findstr /R /C:"IPv4"
echo    http://IP:1984     or     https://IP:1985  ^(accept warning once^)
echo ====================================================
echo.

bin\go2rtc.exe %CFG%
pause
