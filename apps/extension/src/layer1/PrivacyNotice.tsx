/**
 * UX-017 Extension Privacy Notice — T58 (AC-054, AC-076, AC-068 조건부, AC-081 조건부).
 * 확인/거부 두 갈래가 없다 — 읽고 닫기만 있다(동의 저장·철회는 Planning Decision #81로
 * 범위 밖 확정). 표시 여부·재표시 판정은 `notice.ts`(순수 로직)와 `notice-mount.tsx`
 * (오케스트레이션)가 맡고, 이 컴포넌트는 이미 "보여줘야 한다"고 판정된 뒤의 정적 화면이다.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { NOTICE_ITEMS } from './notice';

export interface PrivacyNoticeProps {
  onAcknowledge: () => void;
}

export function PrivacyNotice({ onAcknowledge }: PrivacyNoticeProps) {
  const noticeRef = useRef<HTMLDivElement | null>(null);

  // UX-017 Accessibility — "focus moves into the notice on first show".
  useEffect(() => {
    noticeRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') onAcknowledge();
  }

  return (
    <div
      ref={noticeRef}
      role="dialog"
      aria-label="프라이버시 고지"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={noticeStyle}
    >
      <div style={headerStyle}>이 확장이 하는 일</div>
      <ul style={listStyle}>
        {NOTICE_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <button type="button" onClick={onAcknowledge} style={confirmButtonStyle}>
        확인했습니다
      </button>
    </div>
  );
}

const noticeStyle: React.CSSProperties = {
  position: 'fixed',
  top: '16px',
  right: '16px',
  width: '360px',
  maxHeight: '80vh',
  overflowY: 'auto',
  background: '#fff',
  color: '#111',
  border: '1px solid #ccc',
  borderRadius: '8px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
  padding: '12px',
  fontSize: '13px',
  fontFamily: 'system-ui, sans-serif',
  zIndex: 2147483647,
};

const headerStyle: React.CSSProperties = {
  fontWeight: 600,
  marginBottom: '8px',
};

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: '18px',
  marginBottom: '12px',
};

const confirmButtonStyle: React.CSSProperties = {
  minHeight: '44px',
  width: '100%',
  border: '1px solid #ccc',
  borderRadius: '4px',
  background: '#f5f5f5',
  cursor: 'pointer',
  fontSize: '13px',
};
