// ESLint flat config — 리포 루트. `docs/CodingRules.md` Style 절 · Directory Rules가 단일 출처다.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    // `.claude/**`(팀원별 로컬 도구, .gitignore 대상) · `docs/**`(비-코드 산출물, design-mockups는
    // 별도 커밋 예정 — 건드리지 않는다)는 이 리포의 코드 규칙(`docs/CodingRules.md`) 대상이 아니다.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/coverage/**',
      '.claude/**',
      'docs/**',
      // Next.js가 빌드마다 자동 재생성한다 — 파일 상단에 "이 파일을 손으로 고치지 마라"고 명시한다.
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 스텁 함수의 미구현 매개변수 표기 관례 — `_` 접두사는 "의도적으로 아직 안 씀"을 뜻한다.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // 🔴 packages/core 는 프레임워크·어댑터 의존 0 (AC-028). 위반 시 lint(빌드)가 실패한다.
  // docs/CodingRules.md "`no-restricted-imports` 설정 형태 (T2가 그대로 옮겨 쓸 것)" 원문 그대로.
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['next', 'next/*'], message: 'core는 프레임워크에 의존하지 않는다 (AC-028)' },
            {
              group: ['react', 'react-dom'],
              message: 'core는 프레임워크에 의존하지 않는다 (AC-028)',
            },
            { group: ['@supabase/*'], message: '저장소 접근은 어댑터가 주입한다 (AC-028)' },
            { group: ['openai'], message: 'LLM 호출은 LLMClient 인터페이스로 주입받는다 (AC-028)' },
            {
              group: ['**/apps/**', '../../apps/*'],
              message: 'core는 어댑터를 import 하지 않는다 (AC-028)',
            },
          ],
        },
      ],
    },
  },
);
