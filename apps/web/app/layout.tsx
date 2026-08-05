import type { ReactNode } from 'react';

export const metadata = {
  title: '크로스보더 협업 중재 서비스',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
