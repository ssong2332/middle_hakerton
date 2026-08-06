// UX-004 2패널 중재 워크스페이스 (기본 랜딩, P0) — T12(비교 뷰 + 오해 위험)·T13(2패널
// 레이아웃)·T14(승인 후 전송)가 `MediationWorkspace`로 완성한 화면. 이 파일이 예고했던
// "실제 화면은 T12/T13이 채운다"가 여기서 실현된다 — `MediationDemoForm`(T6의 최소 하네스)은
// 흡수·대체되어 삭제됐다(`MediationWorkspace.tsx` 헤더 주석 참조).
import { MediationWorkspace } from '../../../../components/MediationWorkspace';
import styles from './mediate.module.css';

export default function MediatePage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>중재 워크스페이스</h1>
      <MediationWorkspace />
    </main>
  );
}
