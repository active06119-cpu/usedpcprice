// ============================================================
// prisma/schema.prisma 수정 사항 (diff)
// 기존 schema.prisma에서 아래 두 곳을 수정해야 함
// ============================================================

// ── 변경 1: SnapshotSource enum에 NAVER_SHOPPING 추가 ──────
//
// 기존:
// enum SnapshotSource {
//   DANAWA
//   JOONGNA
//   BUNJANG
//   NAVER_CAFE
//   MANUAL
//   SEED
// }
//
// 변경 후:
// enum SnapshotSource {
//   DANAWA
//   JOONGNA
//   BUNJANG
//   NAVER_CAFE
//   NAVER_SHOPPING   ← 추가
//   MANUAL
//   SEED
// }

// ── 변경 2: 마이그레이션 실행 ──────────────────────────────
// npx prisma migrate dev --name add_naver_shopping_source

// ── 변경 3: package.json scripts 추가 ──────────────────────
// {
//   "scripts": {
//     "import:batch": "ts-node scripts/import/batch-runner.ts",
//     "db:price-profile": "ts-node scripts/normalize/price-aggregator.ts"
//   },
//   "prisma": {
//     "seed": "ts-node prisma/seed.ts"
//   }
// }

// ── 변경 4: 환경변수 (.env) ───────────────────────────────
// DATABASE_URL="postgresql://..."
// NAVER_CLIENT_ID="your_client_id"
// NAVER_CLIENT_SECRET="your_client_secret"

// ── 변경 5: 의존성 설치 ───────────────────────────────────
// npm install playwright
// npx playwright install chromium
//
// package.json dependencies 추가:
// "playwright": "^1.44.0"
