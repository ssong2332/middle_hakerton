// UX-004 2패널 중재 워크스페이스 (기본 랜딩, P0) — T12(비교 뷰 + 오해 위험)·T13(2패널
// 레이아웃)·T14(승인 후 전송)가 `MediationWorkspace`로 완성한 화면. 이 파일이 예고했던
// "실제 화면은 T12/T13이 채운다"가 여기서 실현된다 — `MediationDemoForm`(T6의 최소 하네스)은
// 흡수·대체되어 삭제됐다(`MediationWorkspace.tsx` 헤더 주석 참조).
//
// 🔴 T86 인접(2026-08-12, 사용자 지적) — 목업의 타이틀 행(제목+부제 좌측, "개인화 프로필 적용
// 중" 배지 우측, `docs/UX.md` UX-004 Visual Design Brief)을 T84/T85 두 라운드 모두 구현하지
// 않았었다. 배지는 실제 개인화 데이터에 근거해야 하므로(장식용 상시 표시 금지) 서버 컴포넌트에서
// `checkPersonalizationActive()`로 조회해 `MediationWorkspace`에 값으로 넘긴다 — 클라이언트
// 컴포넌트 안에서 새 fetch를 추가하지 않는 이유는 `MediationWorkspace.test.tsx`의 기존
// `fetchMock.toHaveBeenCalledTimes(1)` 류 단언 수십 건이 전부 "`/api/mediate` 호출 1회"를
// 전제하고 있어, 마운트 시 추가 fetch를 넣으면 그 단언들이 깨진다 — 서버 사이드 prop 전달이
// 기존 테스트를 하나도 건드리지 않는 유일한 경로다. 이 화면은 이미 `(with-nav)/layout.tsx`가
// `force-dynamic`으로 지정해 두어(온보딩 강제 리다이렉트와 같은 이유) 정적 프리렌더 충돌이 없다.
import { checkPersonalizationActive } from '../../../../lib/personalization-status';
import { MediationWorkspace } from '../../../../components/MediationWorkspace';
import styles from './mediate.module.css';

export default async function MediatePage() {
  const personalizationActive = await checkPersonalizationActive();
  return (
    <main className={styles.page}>
      <MediationWorkspace personalizationActive={personalizationActive} />
    </main>
  );
}
