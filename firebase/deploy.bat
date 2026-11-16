@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 민트 아크릴샵 Firebase 배포
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js가 설치되어 있지 않아요. LTS 버전을 설치한 뒤 다시 실행하세요.
  start "" https://nodejs.org/ko
  pause
  exit /b
)
if not exist ".firebaserc" (
  echo.
  set /p PID= Firebase 프로젝트 ID를 입력하고 Enter를 누르세요: 
)
if not exist ".firebaserc" (
  > ".firebaserc" echo {"projects":{"default":"%PID%"}}
)
echo.
echo  1단계: 구글 로그인 창이 열리면 로그인해 주세요. 이미 로그인했다면 넘어가요.
call npx -y firebase-tools@latest login
echo.
echo  2단계: 화면과 Firestore 규칙을 올려요.
call npx -y firebase-tools@latest deploy --only hosting,firestore:rules
echo.
echo  위에 Hosting URL 주소가 보이면 배포 완료예요.
pause
