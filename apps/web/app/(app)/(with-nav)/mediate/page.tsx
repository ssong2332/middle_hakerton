// UX-004 2패널 중재 워크스페이스 (기본 랜딩, P0) — 🔴 실제 화면(2패널 레이아웃, 긴급도 override,
// 티켓 링크, 공휴일 충돌 등)은 T12/T13이 채운다. 여기서는 T6이 AC-030 동적 검증(브라우저에서
// 실제 역번역 요청 1건 실행)을 수행할 수 있도록 <MediationDemoForm>만 최소로 연결한다
// (`apps/web/components/MediationDemoForm.tsx` 헤더 주석 참조) — T12/T13이 이 자리를 대체한다.
import { MediationDemoForm } from '../../../../components/MediationDemoForm';

export default function MediatePage() {
  return (
    <main>
      <h1>UX-004 Mediate (TODO: T12/T13 — 2패널 레이아웃 등 나머지 요소)</h1>
      <MediationDemoForm />
    </main>
  );
}
