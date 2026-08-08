/**
 * T23 — `POST /api/dictionary` · `PUT /api/dictionary/{id}` 공통 요청 스키마(`docs/API.md`
 * "GET / POST /api/dictionary · PUT / DELETE /api/dictionary/{id}" Request 계약). 두 라우트가
 * 몸통 형태를 공유하므로 한 곳에 둔다(`docs/Tasks.md` T23 스코프 — 중복 최소화).
 *
 * 🔴 person 엔트리는 한국어 호칭/영어 호칭 중 최소 하나가 필요하다(`docs/UX.md` UX-010 Validation
 * "at least one of 한국어 호칭/영어 호칭 required") — zod `.refine()`으로 구조적 검증에서
 * 걸러낸다(400 VALIDATION_FAILED). 중복(`sourceText`, 대소문자 무시) 검사는 DB 조회가 필요해
 * 여기서 하지 않는다 — `apps/web/lib/dictionary/storage.ts`의 `hasDuplicate()`가 담당한다(409).
 */
import { z } from 'zod';

export const dictionaryEntryBodySchema = z
  .object({
    entryType: z.enum(['term', 'person']),
    sourceText: z.string().trim().min(1, '용어/실명을 입력해주세요'),
    targetText: z.string().trim().min(1).optional(),
    koHonorific: z.string().trim().min(1).optional(),
    enHonorific: z.string().trim().min(1).optional(),
    note: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) => value.entryType !== 'person' || Boolean(value.koHonorific) || Boolean(value.enHonorific),
    {
      message: '한국어 호칭 또는 영어 호칭 중 하나는 입력해주세요',
      path: ['koHonorific'],
    },
  );

export type DictionaryEntryBody = z.infer<typeof dictionaryEntryBodySchema>;
