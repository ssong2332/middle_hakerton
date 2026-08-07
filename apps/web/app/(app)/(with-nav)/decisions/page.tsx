// UX-008 결정 요약 · 미확정 감지 — T27이 T2 스캐폴드 플레이스홀더를 채운다. 화면 본체는
// `DecisionsWorkspace`(`docs/UX.md` UX-008) — `TicketPage`가 `TicketWorkspace`를 감싸는 것과
// 같은 얇은 wrapper 패턴이다.
// T73① — 경로를 `/summary`에서 `/decisions`로 정정(`docs/UX.md:890`, `docs/Architecture.md:96`).
import { DecisionsWorkspace } from '../../../../components/DecisionsWorkspace';
import styles from './decisions.module.css';

export default function DecisionsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>결정 요약 · 미확정 감지</h1>
      <DecisionsWorkspace />
    </main>
  );
}
