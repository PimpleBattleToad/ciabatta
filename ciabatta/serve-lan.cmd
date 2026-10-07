@echo off
rem Serves the ciabatta calculator over Wi-Fi for your phone.
rem Usage: serve-lan.cmd [port]   (default 8080)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-lan.ps1" %*
pause
