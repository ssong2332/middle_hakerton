/**
 * 상시 내비게이션 바 — T73③(`docs/Tasks.md` T73 row), `docs/UX.md:893`. 항목 순서·문구는
 * `docs/UX.md:893`를 **그대로** 쓴다: Mediate | Profile | Terminology | Pair Protocols |
 * Meeting Times | Decisions | Feedback | 발송 내역(→UX-015) | 관측 표본(→UX-019) + 로그아웃.
 * **목록 밖 항목을 추가하지 않는다**(AC-084⑤, 추가가 필요하면 ux-design 라우팅).
 *
 * 🔴 **AC-084⑥** — 아직 구현되지 않았거나 컷된 화면의 항목은 렌더하지 않는다(비활성/빈/404
 * 링크 금지, T57 "비활성 버튼·빈 버튼 금지" / T40 "비활성이 아니라 미렌더"와 같은 원칙).
 * `implemented` 플래그는 `docs/Tasks.md` 각 화면 담당 태스크 Status를 `done`으로 확인한 뒤에만
 * `true`로 바꾼다(planner/QA가 아니라 그 화면을 채우는 태스크의 implementer가 켠다).
 * measured 2026-08-08: Mediate(T12/T13)·Profile(T21)·Terminology(T23)·Decisions(T27) done,
 * 나머지는 전부 T2 스캐폴드 플레이스홀더("(TODO)")다(`docs/Tasks.md` T31/T41/T42/T52/T72 전부
 * `todo`, Feedback은 담당 태스크 미배정 스텁).
 *
 * `(app)/onboarding`(UX-003)은 이 컴포넌트를 쓰는 `(app)/(with-nav)/layout.tsx`의 형제 라우트
 * 그룹 밖에 있어 이 내비가 렌더되지 않는다(`docs/UX.md:893` "except UX-003") — 회귀 테스트:
 * `apps/web/app/(app)/onboarding/route-composition.test.ts`.
 */
import Link from 'next/link';
import { LogoutButton } from './LogoutButton';
import styles from './PrimaryNav.module.css';

interface NavItem {
  label: string;
  href: string;
  implemented: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Mediate', href: '/mediate', implemented: true }, // UX-004, T12/T13 done
  { label: 'Profile', href: '/profile', implemented: true }, // UX-009, T21 done
  { label: 'Terminology', href: '/terminology', implemented: true }, // UX-010, T23 done
  { label: 'Pair Protocols', href: '/pair-protocols', implemented: false }, // UX-011, T41/T42 todo
  { label: 'Meeting Times', href: '/meeting-times', implemented: false }, // UX-012, T31 todo
  { label: 'Decisions', href: '/decisions', implemented: true }, // UX-008, T27 done
  { label: 'Feedback', href: '/feedback', implemented: false }, // UX-013, 담당 태스크 미배정 스텁
  { label: '발송 내역', href: '/sent-messages', implemented: false }, // UX-015, T52 todo
  { label: '관측 표본', href: '/observation-samples', implemented: false }, // UX-019, T72 todo
];

export function PrimaryNav() {
  const items = NAV_ITEMS.filter((item) => item.implemented);
  return (
    <nav className={styles.nav} aria-label="주 내비게이션">
      <span className={styles.brand}>MEDIATE</span>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href}>{item.label}</Link>
          </li>
        ))}
      </ul>
      <LogoutButton />
    </nav>
  );
}
