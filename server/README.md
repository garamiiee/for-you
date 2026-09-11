# 서버 (Vercel)

앱이 호출하는 세 엔드포인트예요. Vercel Functions(Node, 서울 리전 `icn1`)로
돌아가고, 데이터는 Postgres, 선물 이미지는 Vercel Blob 에 저장해요.

```
POST /api/extract   { image }                          → { image }        누끼
POST /api/friends   { action, userId, code? }           → 초대/연결/조회
POST /api/gifts     { action, userId, image?, message? } → 선물 전송/목록/취소
```

## 현재 상태

전부 동작해요. 추가로 넣을 키나 설정은 없어요.

- [x] 배포됨 — `https://for-you-server-lavumeplz-7617s-projects.vercel.app`
- [x] Neon Postgres `neon-crimson-magnet` + `schema.sql` 적용
- [x] Blob 스토어 `for-you-gifts` (public)
- [x] 배경 제거 — 모델을 서버에서 직접 실행 (외부 API 키 없음)
- [x] 앱의 `src/lib/config.ts` 가 이 주소를 가리킴

## 배경 제거를 외부 API 없이 하는 이유

remove.bg 같은 서비스는 무료 티어가 월 50장이라 소진되면 그때부터 계속
실패해요. 그래서 U^2-Net(`u2netp`, Apache-2.0) 을 ONNX Runtime 의 WASM
백엔드로 함수 안에서 직접 돌려요.

- 키 발급·가입·쿼터가 없어요
- 사진이 제3자 서버로 나가지 않아요
- 모델은 4.6MB 라서 함수에 같이 배포해요 (`models/u2netp.onnx`)
- 이미지 디코딩/인코딩도 순수 JS (`jpeg-js`, `pngjs`) 라서 네이티브 의존성이
  없어요. 리사이즈는 `lib/cutout.ts` 안에 쌍선형 보간으로 직접 넣었어요.

`vercel.json` 의 `includeFiles` 가 모델과 WASM 파일을 함수에 포함시켜요.
메모리는 2048MB 로 올려뒀어요.

실측 응답 시간은 한 장에 3~3.5초예요 (네트워크 + base64 왕복 포함). 앱에는
"오브젝트를 추출 중이에요" 화면이 있어서 그 사이를 채워요.

## 스키마를 다시 넣어야 할 때

```bash
npx vercel env pull .env.local
psql "$(grep -E '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2- | tr -d '\"')" -f schema.sql
```

DDL 은 풀링을 거치지 않는 `DATABASE_URL_UNPOOLED` 를 쓰는 게 안전해요.
런타임(`lib/db.ts`)은 풀링되는 `DATABASE_URL` 을 씁니다.

## 이미지 삭제와 CDN 캐시

선물을 취소하면 DB 행과 Blob 파일이 지워지는데, Blob 공개 URL 은
`s-maxage=300` 으로 CDN 에 캐시돼서 최대 5분간 캐시본이 응답할 수 있어요.
앱은 DB 목록만 보고 그리니까 화면에는 영향이 없어요.

## CORS

허용 Origin 이 SDK 버전마다 달라서 `lib/cors.ts` 에 네 개를 다 넣어뒀어요.

| SDK | Origin |
| --- | --- |
| 1.x ~ 2.x | `for-you.apps.tossmini.com`, `for-you.private-apps.tossmini.com` |
| 3.x | `for-you.web.tossmini.com`, `for-you.private-web.tossmini.com` |

이 프로젝트는 `@apps-in-toss/framework` 2.x 라서 `apps` 쪽이지만, SDK 를
올리면 바뀌고 3.x 도 시점에 따라 `apps` 로 돌아간다고 돼 있어요. 미니앱
`appName` 을 바꾸면 `lib/cors.ts` 의 `APP_NAME` 도 함께 바꿔야 해요.

## 검증

로컬에 Postgres 가 있으면 실제 DB 에 붙여 전체 시나리오를 돌릴 수 있어요.
`scratchpad/probe-server.ts` 하네스가 72개 항목을 확인해요 — CORS, 입력 검증,
초대 코드 유니크성, 1:1 관계 보호, 만료, 동시 수락/전송, 하루 한 번 제한,
목록 정렬, 취소, 업로드 실패 정리.

## 인증에 대해

엔드포인트는 인증 없이 열려 있고 `userId` 로만 구분해요. 기기에서 만든
식별자라 추측하기는 어렵지만 진짜 인증은 아니에요. 실제 인증이 필요해지면
`appLogin()` 으로 받은 인가 코드를 서버가 mTLS 로 교환해 `userKey` 를 받는
방식으로 바꾸면 되고, 앱 쪽은 `src/lib/friends.ts` 의 `getUserId()` 안쪽만
갈아끼우면 나머지는 그대로 동작해요.
