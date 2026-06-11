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
```

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
