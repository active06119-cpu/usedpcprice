-- PostgREST(anon/authenticated) 노출 차단.
-- Prisma는 postgres/서비스 롤로 접속하므로 RLS를 우회합니다.

ALTER TABLE public.valuation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.valuation_results FROM anon, authenticated;
REVOKE ALL ON TABLE public.market_listings FROM anon, authenticated;
