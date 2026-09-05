# 중고 컴퓨터 시세 계산기 MVP

한국어 기반 중고 데스크탑/부품 공정가 추정 앱입니다.

## 기술 스택

- 앱: Next.js (App Router) + TypeScript + Tailwind + shadcn 스타일 UI
- DB 엔진: PostgreSQL
- ORM: Prisma
- 호스팅 DB: Supabase Postgres

## 환경 변수

`.env` 파일에 아래 값을 설정하세요.

```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require&pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require"
ANTHROPIC_API_KEY="your_anthropic_api_key"
ADMIN_API_TOKEN="long-random-server-only-token"
```

- `ADMIN_API_TOKEN`은 서버 전용입니다. `NEXT_PUBLIC_`으로 노출하지 마세요.
- 관리자 화면(`/admin`)은 로그인 후 httpOnly 쿠키로 인증됩니다.
- 토큰이 없으면 `/admin`과 `/api/admin/*`는 fail-closed(401/로그인 리다이렉트)입니다.

## 로컬 실행

1. 의존성 설치
   - `npm install`
2. Prisma 검증/클라이언트 생성
   - `npm run prisma:validate`
   - `npm run prisma:generate`
3. 마이그레이션 실행
   - `npm run prisma:migrate -- --name init`
4. 시드 데이터 입력
   - `npm run prisma:seed`
5. 개발 서버 실행
   - `npm run dev`

관리자 페이지: `http://localhost:3000/admin/login`

## 공개 API 제한

비용/남용 방지를 위해 공개 분석 API는 IP 기준으로 제한됩니다. (인스턴스 메모리 버킷)

- `POST /api/analyze`: IP당 분당 8회, 본문 최대 8,000자
- `POST /api/analyze-bulk`: 같은 버킷을 매물 개수만큼 소모, 본문 최대 20,000자, 한 번에 최대 10개
- 초과 시 `429` + `Retry-After`

`POST /api/market/import`는 크롤링 + Claude + DB 저장이라 관리자 인증이 필요합니다.

## 테스트

```bash
npm test
```

단위 테스트는 DB/Claude 없이 돌아갑니다. 핵심 회귀:

- `4060` vs `4060 Ti` 모델키 분리 (`8GB` 용량 표기 포함)
- ingest 저장 문킱 (`used-listing-guard`)

CI: `.github/workflows/test.yml` (`push`/`pull_request` 시 `npm test`)

## 주요 스크립트

- `npm run prisma:validate`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:seed`
- `npm run import:batch`
- `npm run import:price-profile`

## 수집기 환경 변수

`scripts/import` 배치 수집기를 정상 동작시키려면 아래 환경변수가 필요합니다.

```env
NAVER_CLIENT_ID="your_naver_openapi_client_id"
NAVER_CLIENT_SECRET="your_naver_openapi_client_secret"
```

Playwright 기반 수집기(다나와/당근)를 처음 실행하기 전에:

```bash
npx playwright install chromium
```
