@echo off
rem Builds ciabatta-site.zip with the site files for hosting.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-zip.ps1" %*
pause
