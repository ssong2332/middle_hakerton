// UX-007 Vent-to-Ticket View — T25가 T2 스캐폴드 플레이스홀더를 채운다. 화면 본체는
// `TicketWorkspace`(`docs/UX.md` UX-007) — `MediatePage`가 `MediationWorkspace`를 감싸는 것과
// 같은 얇은 wrapper 패턴이다.
import { TicketWorkspace } from '../../../../components/TicketWorkspace';
import styles from './ticket.module.css';

export default function TicketPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>태스크 티켓</h1>
      <TicketWorkspace />
    </main>
  );
}
