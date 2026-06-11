-- SnapshotSource enum 확장 (Supabase SQL Editor에서 실행)
-- 기존 enum 값:
-- DANAWA, JOONGNA, BUNJANG, NAVER_CAFE, MANUAL, SEED

ALTER TYPE "SnapshotSource" ADD VALUE IF NOT EXISTS 'DAANGN';
ALTER TYPE "SnapshotSource" ADD VALUE IF NOT EXISTS 'NAVER_SHOPPING';
