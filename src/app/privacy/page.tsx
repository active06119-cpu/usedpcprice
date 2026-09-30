import type { Metadata } from "next";
import Link from "next/link";

import { getContactInfo } from "@/lib/contact";

export const metadata: Metadata = {
  title: "개인정보처리방침 | PC시세",
  description: "개인정보 보호법 제30조에 따른 PC시세 개인정보 처리방침",
};

export default function PrivacyPage() {
  const { email, telegramUsername, telegramUrl } = getContactInfo();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-sm leading-7 text-zinc-700">
      <h1 className="text-2xl font-semibold text-zinc-900">개인정보 처리방침</h1>
      <p className="mt-2 text-zinc-500">시행일 2026년 9월 30일 · 개인정보 보호법 제30조</p>
      <p className="mt-4">
        PC시세(이하 “서비스”)는 개인정보 보호법 및 관련 법령을 준수하여 정보주체의 개인정보를 보호합니다.
        본 방침은 서비스가 어떤 정보를 어떻게 처리하는지 알리기 위해 공개합니다.
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">1. 처리 목적</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>중고 PC 시세 산정 및 검색 서비스 제공</li>
          <li>매물 원문·URL 게시 및 중복 방지</li>
          <li>부품 가격 이상 신고 검토</li>
          <li>부정당 이용 방지, 오류 확인, 문의 응대</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">2. 처리하는 항목</h2>
        <p>회원 가입을 받지 않으며, 이름·주민등록번호·전화번호를 필수로 받지 않습니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>이용자가 붙여넣는 매물 글·가격·이미지 및 공유 링크</li>
          <li>장터에 올리는 제목, 가격, 지역, 원문 URL</li>
          <li>가격 이상 신고 내용(부품명, 신고 가격)</li>
          <li>접속 기록: IP 주소, 요청 시각, 브라우저 정보(부정당 방지 목적)</li>
        </ul>
        <p>
          당근·번개 글을 그대로 붙여넣으면 글 안에 전화번호 등 개인정보가 포함될 수 있습니다.
          그런 정보는 시세 산정 목적 외에는 쓰지 않습니다.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">3. 처리 및 보유 기간</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>시세 계산 결과 캐시: 최대 24시간</li>
          <li>장터 게시글: 삭제 요청 또는 운영자 삭제 시까지</li>
          <li>부품 시세(가격 스냅샷): 시세 통계 목적으로 최대 6개월</li>
          <li>IP 접속 기록: 최대 30일</li>
        </ul>
        <p>관련 법령에 따른 보존이 필요한 경우 해당 기간 동안 보관합니다. 예: 전자상거래등에서의 소비자보호에 관한 법률에 따른 분쟁 또는 불만 처리 기록 3년.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">4. 제3자 제공</h2>
        <p>법령에 따른 경우 또는 정보주체의 별도 동의가 있는 경우 외에는 개인정보를 외부에 제공하지 않습니다.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">5. 처리위탁 및 국외 이전</h2>
        <p>서비스 운영을 위해 아래 업체에 처리를 위탁합니다. 일부 서버는 해외에 있으며, 개인정보 보호법 제28조의8에 따라 이 사실을 알립니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Vercel: 웹 호스팅 및 배포</li>
          <li>Supabase(클라우드 영역 포함 가능): 데이터베이스 보관</li>
          <li>Anthropic: 매물 글에서 부품명을 뽑아 내는 분석 처리</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">6. 파기 절차 및 방법</h2>
        <p>보유 기간이 끝나거나 처리 목적이 달성되면 복구할 수 없는 방법으로 지체 또는 절연합니다. 전자파일은 복구 불능한 삭제, 출력물은 파쇄 또는 소각합니다.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">7. 정보주체의 권리</h2>
        <p>
          정보주체는 개인정보 보호법 제35조부터 제37조에 따라 열람, 정정·삭제, 처리 정지를 요구할 수 있습니다.
          대리인은 법정대리인의 권리를 행사할 수 있습니다. 하단의 문의 채널로 요청하면 10일 이내에 회신합니다.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">8. 자동 수집 장치(쿠키)</h2>
        <p>서비스는 광고·추적 쿠키를 쓰지 않습니다. 접속 안정성 유지에 필요한 기술적 쿠키만 사용할 수 있으며, 브라우저에서 차단할 수 있습니다.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">9. 안전성 확보 조치</h2>
        <p>접속 권한 제한, 전송 구간 암호화, 관리자 인증, 부정당 제한을 적용합니다. 개인정보를 목적 외로 매매하거나 외부에 느솔 편하게 제공하지 않습니다.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">10. 개인정보 보호책임자</h2>
        <p>개인정보 보호법 제31조에 따른 책임자는 서비스 운영자입니다. 고충 신고는 아래로 받습니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            문의:{" "}
            {email ? (
              <a href={`mailto:${email}`} className="text-[#1e3a5f] underline">
                {email}
              </a>
            ) : (
              <span>환경변수 NEXT_PUBLIC_CONTACT_EMAIL</span>
            )}
            {telegramUrl && telegramUsername ? (
              <>
                {" · "}
                <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="text-[#1e3a5f] underline">
                  텔레그램 @{telegramUsername}
                </a>
              </>
            ) : null}
          </li>
          <li>개인정보침해신고센터(코리아): privacy.go.kr / 118</li>
          <li>개인정보분쟁조정위원회: www.kopico.go.kr / 1833-6972</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">11. 변경</h2>
        <p>방침을 바꾸면 이 페이지에 개정일과 변경 내용을 공개합니다.</p>
      </section>

      <p className="mt-10 text-zinc-500">
        <Link href="/terms" className="text-[#1e3a5f] underline">
          이용약관
        </Link>
        {" · "}
        <Link href="/" className="text-[#1e3a5f] underline">
          홈
        </Link>
      </p>
    </main>
  );
}
