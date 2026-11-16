# 민트 아크릴샵 AI 챗봇

아크릴 스탠드 상담 챗봇과 관리자 화면이에요. 연습용 가상 쇼핑몰 데이터를 사용해요.

## 두 가지 실행 방법

| 방법 | 파일 | 필요한 것 | API 키 위치 |
|---|---|---|---|
| 서버 버전 (권장) | `start.bat` → `server.js` + `public/index.html` | Node.js 18 이상 | `.env` 파일 |
| 파일 하나 버전 | `demo/index.html` | 브라우저만 | 화면의 "AI 설정"에 입력 |

### 서버 버전

1. [Node.js](https://nodejs.org) LTS 설치
2. `start.bat` 더블클릭 (처음 실행하면 `.env`가 만들어지고 메모장이 열려요)
3. `ANTHROPIC_API_KEY=` 뒤에 키를 넣고 저장한 뒤 다시 실행
4. 브라우저에서 `http://localhost:3000`

### 파일 하나 버전

`demo/index.html`을 크롬이나 엣지로 열고, 오른쪽 위 "AI 설정"에 API 키를 넣어요.
키를 브라우저에서 바로 쓰는 방식이라 개인 PC에서만 쓰세요.

## 주요 기능

- 아크릴 스탠드 상품 안내, 가상 주문, 배송 조회 (AI 도구 호출)
- 답변마다 좋아요, 아쉬워요, 신고하기
- 관리자: 상품, 재고, 주문, 배송, 아크릴 탭 설정
- 관리자: 대화 기록, 신고 통계, 답변 지침 (피드백을 다음 답변 지침으로 반영)

## 폴더 구성

```
server.js            서버 (API 키 보관, AI 호출, data.json 저장)
public/index.html    화면
seed.json            처음 가상 데이터
.env.example         설정 견본 (.env는 올리지 않아요)
start.bat            Windows 실행 파일
demo/index.html      서버 없이 열리는 파일 하나 버전
tools/               demo/index.html 만드는 스크립트 (python tools/build_demo.py)
```

## 주의

- `.env`와 `data.json`은 `.gitignore`로 올라가지 않아요. API 키를 커밋하지 마세요.
- 모든 주문과 배송은 연습용 가상 데이터예요. 실제 고객 정보를 넣지 마세요.
- 대화 기록은 각 사용자의 브라우저(로컬 스토리지)에 저장돼요.
- 관리자 화면에 비밀번호가 없어요. 여러 사람이 쓰는 곳에 그대로 공개하지 마세요.
