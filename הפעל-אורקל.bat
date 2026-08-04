@echo off
chcp 65001 >nul
cd /d "%~dp0"
title STO(MA)CK TERMINAL
echo ============================================
echo   STO(MA)CK TERMINAL
echo   מפעיל שרת מקומי...
echo ============================================
echo.

start "STOMACK SERVER" cmd /k "cd /d "%~dp0" && npx --yes http-server "%~dp0" -p 8000 -c-1"
echo ממתין שהשרת יעלה...
timeout /t 5 >nul

set "URL=http://localhost:8000/index.html?v=%RANDOM%%RANDOM%"
set "FLAGS=--use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check --disable-fre --kiosk --start-fullscreen --user-data-dir=%TEMP%\stomack-profile"

rem --- איתור דפדפן (Chrome קודם, אחרת Edge) ---
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

rem --- סגירת חלונות דפדפן קיימים כדי שהדגלים ייכנסו לתוקף ---
echo סוגר חלונות דפדפן קיימים...
taskkill /F /IM chrome.exe >nul 2>&1
taskkill /F /IM msedge.exe >nul 2>&1
timeout /t 2 >nul

rem --- ניקוי מטמון הדפדפן כדי שלא ייטען עמוד ישן ---
rmdir /s /q "%TEMP%\stomack-profile\Default\Cache" >nul 2>&1
rmdir /s /q "%TEMP%\stomack-profile\Default\Code Cache" >nul 2>&1

if defined BROWSER (
  echo פותח דפדפן עם הרשאות מצלמה ומיקרופון אוטומטיות...
  start "" "%BROWSER%" %FLAGS% "%URL%"
) else (
  echo לא נמצא Chrome/Edge — נפתח בדפדפן ברירת המחדל. ייתכן שתופיע בקשת אישור למצלמה/מיקרופון.
  start "" "%URL%"
)

echo.
echo נפתח בכתובת %URL%
echo החלון השני (STOMACK SERVER) חייב להישאר פתוח כל עוד האתר פעיל.
echo.
pause
