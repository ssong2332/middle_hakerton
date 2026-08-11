'use client';

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
 * measured 2026-08-11: Mediate(T12/T13)·Profile(T21)·Terminology(T23)·Decisions(T27)·
 * 발송 내역(T52)·관측 표본(T72) done, 나머지는 전부 T2 스캐폴드 플레이스홀더("(TODO)")다
 * (`docs/Tasks.md` T31/T41/T42는 여전히 `todo`, Feedback은 담당 태스크 미배정 스텁).
 *
 * 🔴 **발견(T72, 2026-08-11) — "Pair Protocols" 항목이 stale하다**: `docs/Tasks.md` T41/T42는
 * 이미 `done`인데 이 파일은 여전히 `implemented: false`로 남아 있었다(위 주석의 "T41/T42
 * todo"도 stale이었다 — 아래 값은 고치지 않았다, 그 화면의 nav 노출은 T41/T42 담당자가 켜야
 * 한다는 이 파일 자신의 관례를 따른다). planner/T41·T42 담당 라운드에서 확인 필요.
 *
 * `(app)/onboarding`(UX-003)은 이 컴포넌트를 쓰는 `(app)/(with-nav)/layout.tsx`의 형제 라우트
 * 그룹 밖에 있어 이 내비가 렌더되지 않는다(`docs/UX.md:893` "except UX-003") — 회귀 테스트:
 * `apps/web/app/(app)/onboarding/route-composition.test.ts`.
 *
 * 🔴 **(2026-08-12, T77) 모바일 내비 접기** — `docs/UX.md` v6.8 "Mobile Nav Menu" 고정 스펙
 * 그대로: `< 768px`에서 항목 목록이 트리거(☰ + "메뉴" 텍스트) 뒤로 숨고, 트리거를 누르면
 * 트리거 바로 아래에 **인라인 disclosure**(모달 아님, 포커스 트랩 없음)로 펼쳐진다. 열릴 때
 * 첫 항목으로 포커스 이동, **Escape로 닫고 트리거로 포커스 복귀**(이 리포의 다른 모달들과 같은
 * close/focus-return 관례 재사용 — 단 이 위젯 자체는 dialog가 아니다). 항목 밖 클릭도 닫는다.
 * Desktop/Tablet(`≥ 768px`)에서는 트리거를 숨기고 기존 가로 목록을 그대로 보여준다(CSS만
 * 다르고 마크업은 항상 렌더 — `open` 상태가 CSS 쿼리 밖에서는 무시된다).
 */
import { useEffect, useRef, useState } from 'react';
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
  { label: '발송 내역', href: '/sent-messages', implemented: true }, // UX-015, T52 done
  { label: '관측 표본', href: '/observation-samples', implemented: true }, // UX-019, T72 done
];

const LIST_ID = 'primary-nav-list';

export function PrimaryNav() {
  const items = NAV_ITEMS.filter((item) => item.implemented);
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // 🔴 UX.md v6.8 — 열릴 때 첫 항목으로 포커스 이동.
  useEffect(() => {
    if (!menuOpen) return;
    const firstLink = listRef.current?.querySelector<HTMLElement>('a');
    firstLink?.focus();
  }, [menuOpen]);

  // 🔴 UX.md v6.8 — 항목 밖 클릭 시 닫는다(포커스 트랩이 없는 disclosure이므로 배경 클릭이
  // 유효한 상호작용이다).
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  function closeAndReturnFocus() {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }

  // 🔴 UX.md v6.8 — Escape로 닫고 트리거로 포커스 복귀(이 리포의 다른 모달과 같은 관례).
  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && menuOpen) {
      event.stopPropagation();
      closeAndReturnFocus();
    }
  }

  return (
    <nav
      ref={navRef}
      className={styles.nav}
      aria-label="주 내비게이션"
      onKeyDown={handleKeyDown}
    >
      <span className={styles.brand}>MEDIATE</span>
      <button
        ref={triggerRef}
        type="button"
        className={styles.menuTrigger}
        aria-expanded={menuOpen}
        aria-controls={LIST_ID}
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        <span aria-hidden="true">☰</span> 메뉴
      </button>
      <ul
        id={LIST_ID}
        ref={listRef}
        className={menuOpen ? `${styles.list} ${styles.listOpen}` : styles.list}
      >
        {items.map((item) => (
          <li key={item.href}>
            {/* 항목 활성화(=이동)도 메뉴를 닫는다(UX.md v6.8) — 라우트 전환으로 이 컴포넌트가
                다시 마운트되며 자연히 닫히지만, 같은 세션 안에서 상태를 명시적으로 되돌린다. */}
            <Link href={item.href} onClick={() => setMenuOpen(false)}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.logoutSlot}>
        <LogoutButton />
      </div>
    </nav>
  );
}
