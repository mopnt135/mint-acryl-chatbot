# 파이어베이스 배포판 (스파크 무료 요금제)

화면은 Firebase Hosting, 가상 쇼핑몰 데이터는 Firestore에 올려요.
서버 코드(Cloud Functions)는 무료 요금제에서 못 쓰기 때문에, AI는 방문자 브라우저에서 바로 불러요.
그래서 방문자가 화면 오른쪽 위 "AI 설정"에 자기 API 키를 넣어야 AI가 답해요.

## 처음 한 번만 할 일 (Firebase 콘솔)

1. Firebase 콘솔에서 프로젝트 만들기
2. 왼쪽 메뉴 Firestore Database 에서 데이터베이스 만들기 (위치는 asia-northeast3 서울 추천)
3. 프로젝트 설정에서 프로젝트 ID 복사

## 배포

1. Node.js LTS 설치
2. 이 폴더의 deploy.bat 더블클릭
3. 프로젝트 ID 붙여 넣기, 구글 로그인
4. 마지막에 나오는 Hosting URL 이 사이트 주소예요

## 화면 고치기

public/index.html 을 직접 고치지 말고, 원본(public/index.html, tools/demo_server.js)을 고친 뒤
python tools/build_demo.py 와 python tools/build_firebase.py 를 차례로 실행하고 다시 배포하세요.

## 주의

- 관리자 비밀번호가 없고 Firestore 규칙이 공개라, 주소를 아는 누구나 상품 데이터와 지침을 바꾸거나 초기화할 수 있어요.
- 두 사람이 동시에 저장하면 나중에 저장한 쪽 내용만 남아요.
- 대화 기록과 API 키는 각 방문자 브라우저에만 저장돼요. 실제 고객 정보를 넣지 마세요.
