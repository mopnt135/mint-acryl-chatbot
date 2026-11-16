@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 민트 아크릴샵 챗봇 서버
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js가 설치되어 있지 않아요.
  echo  열리는 사이트에서 LTS 버전을 설치한 뒤, 이 파일을 다시 더블클릭하세요.
  echo.
  start "" https://nodejs.org/ko
  pause
  exit /b
)
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo  설정 파일 .env 를 만들었어요.
  echo  메모장이 열리면 ANTHROPIC_API_KEY= 뒤에 API 키를 붙여 넣고 저장한 뒤 메모장을 닫으세요.
  echo.
  notepad ".env"
)
node server.js
echo.
echo  서버가 꺼졌어요. 위의 안내 문구를 확인하세요.
pause
