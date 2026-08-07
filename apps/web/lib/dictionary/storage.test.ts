/**
 * T22 — C5 용어사전 조회 (`dictionary_terms`). Supabase는 실제로 호출하지 않고 최소 체이닝만
 * 흉내내는 페이크로 검증한다(`apps/web/lib/messages/pattern-learning.test.ts`와 같은 모킹 정책).
 *
 * T23(UX-010 화면) 추가분은 아래 "T23 —" 표시 구획부터다: 화면용 상세 조회(id·note 포함)와
 * CRUD(create/update/delete), 그중 create/update의 대소문자 무시 중복 차단(AC-016)이 핵심이다.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createDictionaryEntry,
  deleteDictionaryEntry,
  fetchDictionaryEntries,
  fetchDictionaryEntriesDetailed,
  updateDictionaryEntry,
} from './storage';

interface FakeHandle {
  client: SupabaseClient;
  eqCalls: Array<[string, unknown]>;
  selectCalls: string[];
}

function createFakeSupabase(
  options: { rows?: unknown[]; error?: { message: string } | null } = {},
): FakeHandle {
  const eqCalls: Array<[string, unknown]> = [];
  const selectCalls: string[] = [];

  const client = {
    from(table: string) {
      if (table !== 'dictionary_terms') throw new Error(`unexpected table: ${table}`);
      return {
        select: (columns: string) => {
          selectCalls.push(columns);
          return {
            eq: (column: string, value: unknown) => {
              eqCalls.push([column, value]);
              return Promise.resolve({
                data: options.error ? null : (options.rows ?? []),
                error: options.error ?? null,
              });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, eqCalls, selectCalls };
}

describe('fetchDictionaryEntries', () => {
  it('owner_user_id로 스코프해 조회한다(AC-016 — 사용자 스코프, docs/Database.md dictionary_terms)', async () => {
    const { client, eqCalls } = createFakeSupabase({ rows: [] });

    await fetchDictionaryEntries(client, 'user-1');

    expect(eqCalls).toEqual([['owner_user_id', 'user-1']]);
  });

  it('비어 있으면 []를 반환한다(AC-015 위반 없음 — 사전 미등록도 정상 상태)', async () => {
    const { client } = createFakeSupabase({ rows: [] });

    const result = await fetchDictionaryEntries(client, 'user-1');

    expect(result).toEqual([]);
  });

  it('term 엔트리를 core의 DictionaryEntry(camelCase)로 변환한다(AC-015)', async () => {
    const { client } = createFakeSupabase({
      rows: [
        {
          entry_type: 'term',
          source_text: 'SLA',
          target_text: 'SLA',
          ko_honorific: null,
          en_honorific: null,
        },
      ],
    });

    const result = await fetchDictionaryEntries(client, 'user-1');

    expect(result).toEqual([
      {
        entryType: 'term',
        sourceText: 'SLA',
        targetText: 'SLA',
        koHonorific: null,
        enHonorific: null,
      },
    ]);
  });

  it('person 엔트리(실명/한국어 호칭/영어 호칭)를 그대로 변환한다(AC-047①)', async () => {
    const { client } = createFakeSupabase({
      rows: [
        {
          entry_type: 'person',
          source_text: '김수진',
          target_text: null,
          ko_honorific: '김 대리님',
          en_honorific: 'Sujin Kim',
        },
      ],
    });

    const result = await fetchDictionaryEntries(client, 'user-1');

    expect(result).toEqual([
      {
        entryType: 'person',
        sourceText: '김수진',
        targetText: null,
        koHonorific: '김 대리님',
        enHonorific: 'Sujin Kim',
      },
    ]);
  });

  it('en_honorific이 null인 person 엔트리는 null을 그대로 보존한다(AC-047②③ — 추측 생성 금지의 전제)', async () => {
    const { client } = createFakeSupabase({
      rows: [
        {
          entry_type: 'person',
          source_text: '이민호',
          target_text: null,
          ko_honorific: '이 팀장님',
          en_honorific: null,
        },
      ],
    });

    const result = await fetchDictionaryEntries(client, 'user-1');

    expect(result[0].enHonorific).toBeNull();
  });

  it('조회 실패 시 에러를 던진다(에러 삼키기 금지)', async () => {
    const { client } = createFakeSupabase({ error: { message: 'connection failed' } });

    await expect(fetchDictionaryEntries(client, 'user-1')).rejects.toEqual({
      message: 'connection failed',
    });
  });
});

// T23 — UX-010 화면 조회(id·note 포함, `fetchDictionaryEntries`와 다른 select). AC-016.
describe('fetchDictionaryEntriesDetailed', () => {
  it('owner_user_id로 스코프해 조회한다(AC-016)', async () => {
    const { client, eqCalls } = createFakeSupabase({ rows: [] });

    await fetchDictionaryEntriesDetailed(client, 'user-1');

    expect(eqCalls).toEqual([['owner_user_id', 'user-1']]);
  });

  it('id·note를 포함해 카멜케이스로 변환한다(화면 전용 컬럼 — fetchDictionaryEntries는 select하지 않는다)', async () => {
    const { client } = createFakeSupabase({
      rows: [
        {
          id: 'entry-1',
          entry_type: 'term',
          source_text: 'SLA',
          target_text: 'SLA',
          ko_honorific: null,
          en_honorific: null,
          note: '항상 원문 유지',
        },
      ],
    });

    const result = await fetchDictionaryEntriesDetailed(client, 'user-1');

    expect(result).toEqual([
      {
        id: 'entry-1',
        entryType: 'term',
        sourceText: 'SLA',
        targetText: 'SLA',
        koHonorific: null,
        enHonorific: null,
        note: '항상 원문 유지',
      },
    ]);
  });

  it('비어 있으면 []를 반환한다', async () => {
    const { client } = createFakeSupabase({ rows: [] });

    const result = await fetchDictionaryEntriesDetailed(client, 'user-1');

    expect(result).toEqual([]);
  });

  it('조회 실패 시 에러를 던진다(에러 삼키기 금지)', async () => {
    const { client } = createFakeSupabase({ error: { message: 'connection failed' } });

    await expect(fetchDictionaryEntriesDetailed(client, 'user-1')).rejects.toEqual({
      message: 'connection failed',
    });
  });
});

// C-1 — 리뷰 지적: 현재 코드는 raw sourceText를 그대로 `.ilike()`에 넘겨 `%`/`_`/`*`를
// LIKE 와일드카드로 해석시킨다(PostgREST가 `*`→`%`도 매핑). 아래 헬퍼는 실제 Postgres
// ILIKE 의미를 최소한으로 흉내내, 수정 전 코드(`.ilike()` 사용)로 테스트를 돌리면 와일드카드
// 오탐이 재현되고(red), 수정 후 코드(애플리케이션 레벨 정확 비교)로 돌리면 통과한다(green).
function ilikePatternMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const translated = escaped.replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${translated}$`, 'i').test(value);
}

interface DupRow {
  id: string;
  source_text: string;
}

// T23 — 생성(POST /api/dictionary). AC-016, AC-047.
interface FakeCreateHandle {
  client: SupabaseClient;
  duplicateEqCalls: Array<[string, unknown]>;
  ilikeCalls: Array<[string, unknown]>;
  insertedRows: unknown[];
}

function createFakeCreateSupabase(
  options: {
    duplicateRows?: DupRow[];
    duplicateError?: { message: string } | null;
    insertedRow?: unknown;
    insertError?: { message: string } | null;
  } = {},
): FakeCreateHandle {
  const duplicateEqCalls: Array<[string, unknown]> = [];
  const ilikeCalls: Array<[string, unknown]> = [];
  const insertedRows: unknown[] = [];
  const baseRows = options.duplicateRows ?? [];

  const client = {
    from(table: string) {
      if (table !== 'dictionary_terms') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (col1: string, val1: unknown) => {
            duplicateEqCalls.push([col1, val1]);
            return {
              eq: (col2: string, val2: unknown) => {
                duplicateEqCalls.push([col2, val2]);
                // 새 구현(수정 후)은 owner_user_id+entry_type 스코프까지만 서버 쿼리로
                // 걸고, 이 promise를 바로 await한다(추가 `.ilike()` 호출 없음).
                const resultPromise = Promise.resolve({
                  data: options.duplicateError ? null : baseRows,
                  error: options.duplicateError ?? null,
                }) as Promise<{ data: DupRow[] | null; error: { message: string } | null }> & {
                  ilike: (col: string, val: unknown) => Promise<unknown>;
                };
                // 옛 구현(수정 전)은 여기서 `.ilike()`를 호출한다 — 실제 Postgres ILIKE처럼
                // 와일드카드 패턴 매칭을 흉내내 리뷰가 지적한 오탐을 그대로 재현한다.
                resultPromise.ilike = (col3: string, val3: unknown) => {
                  ilikeCalls.push([col3, val3]);
                  if (options.duplicateError) {
                    return Promise.resolve({ data: null, error: options.duplicateError });
                  }
                  const filtered = baseRows.filter((row) =>
                    ilikePatternMatches(String(val3), row.source_text),
                  );
                  return Promise.resolve({ data: filtered, error: null });
                };
                return resultPromise;
              },
            };
          },
        }),
        insert: (row: unknown) => {
          insertedRows.push(row);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: options.insertError ? null : (options.insertedRow ?? null),
                  error: options.insertError ?? null,
                }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, duplicateEqCalls, ilikeCalls, insertedRows };
}

describe('createDictionaryEntry — AC-016/AC-047', () => {
  it('중복이 없으면 owner_user_id를 실어 insert하고 생성된 엔트리를 반환한다', async () => {
    const { client, insertedRows } = createFakeCreateSupabase({
      duplicateRows: [],
      insertedRow: {
        id: 'entry-1',
        entry_type: 'term',
        source_text: 'SLA',
        target_text: 'Service Level Agreement',
        ko_honorific: null,
        en_honorific: null,
        note: null,
      },
    });

    const result = await createDictionaryEntry(client, 'user-1', {
      entryType: 'term',
      sourceText: 'SLA',
      targetText: 'Service Level Agreement',
    });

    expect(insertedRows[0]).toMatchObject({
      owner_user_id: 'user-1',
      entry_type: 'term',
      source_text: 'SLA',
      target_text: 'Service Level Agreement',
    });
    expect(result).toEqual({
      id: 'entry-1',
      entryType: 'term',
      sourceText: 'SLA',
      targetText: 'Service Level Agreement',
      koHonorific: null,
      enHonorific: null,
      note: null,
    });
  });

  it('term 중복(대소문자 무시)이 있으면 DuplicateEntryError("이미 등록된 용어입니다")를 던지고 insert하지 않는다', async () => {
    const { client, insertedRows } = createFakeCreateSupabase({
      duplicateRows: [{ id: 'existing-1', source_text: 'SLA' }],
    });

    await expect(
      createDictionaryEntry(client, 'user-1', { entryType: 'term', sourceText: 'sla' }),
    ).rejects.toMatchObject({ code: 'CONFLICT_DUPLICATE_ENTRY', message: '이미 등록된 용어입니다' });
    expect(insertedRows).toHaveLength(0);
  });

  it('person 중복이 있으면 DuplicateEntryError("이미 등록된 인물입니다")를 던진다', async () => {
    const { client } = createFakeCreateSupabase({
      duplicateRows: [{ id: 'existing-1', source_text: '김수진' }],
    });

    await expect(
      createDictionaryEntry(client, 'user-1', {
        entryType: 'person',
        sourceText: '김수진',
        koHonorific: '김 대리님',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT_DUPLICATE_ENTRY', message: '이미 등록된 인물입니다' });
  });

  it('중복 조회는 owner_user_id·entry_type으로만 서버 쿼리를 스코프하고, sourceText 비교는 애플리케이션 레벨에서 한다(C-1 — ilike 미사용)', async () => {
    const { client, duplicateEqCalls, ilikeCalls } = createFakeCreateSupabase({
      duplicateRows: [],
      insertedRow: {
        id: 'entry-1',
        entry_type: 'term',
        source_text: 'SLA',
        target_text: null,
        ko_honorific: null,
        en_honorific: null,
        note: null,
      },
    });

    await createDictionaryEntry(client, 'user-1', { entryType: 'term', sourceText: 'SLA' });

    expect(duplicateEqCalls).toEqual([
      ['owner_user_id', 'user-1'],
      ['entry_type', 'term'],
    ]);
    expect(ilikeCalls).toEqual([]);
  });

  it('C-1 — LIKE 메타문자(%)를 포함한 신규 용어는 부분 매치로 오탐되지 않는다(기존 "100% 달성" + 신규 "100%"는 서로 다른 값)', async () => {
    const { client, insertedRows } = createFakeCreateSupabase({
      duplicateRows: [{ id: 'existing-1', source_text: '100% 달성' }],
      insertedRow: {
        id: 'entry-2',
        entry_type: 'term',
        source_text: '100%',
        target_text: null,
        ko_honorific: null,
        en_honorific: null,
        note: null,
      },
    });

    await expect(
      createDictionaryEntry(client, 'user-1', { entryType: 'term', sourceText: '100%' }),
    ).resolves.toMatchObject({ sourceText: '100%' });
    expect(insertedRows).toHaveLength(1);
  });

  it('중복 조회 실패 시 에러를 던진다(에러 삼키기 금지)', async () => {
    const { client } = createFakeCreateSupabase({
      duplicateError: { message: 'connection failed' },
    });

    await expect(
      createDictionaryEntry(client, 'user-1', { entryType: 'term', sourceText: 'SLA' }),
    ).rejects.toEqual({ message: 'connection failed' });
  });

  it('insert 실패 시 에러를 던진다(에러 삼키기 금지)', async () => {
    const { client } = createFakeCreateSupabase({
      duplicateRows: [],
      insertError: { message: 'connection failed' },
    });

    await expect(
      createDictionaryEntry(client, 'user-1', { entryType: 'term', sourceText: 'SLA' }),
    ).rejects.toEqual({ message: 'connection failed' });
  });
});

// T23 — 수정(PUT /api/dictionary/{id}). AC-016, AC-047.
interface FakeUpdateHandle {
  client: SupabaseClient;
  duplicateEqCalls: Array<[string, unknown]>;
  ilikeCalls: Array<[string, unknown]>;
  updateEqCalls: Array<[string, unknown]>;
  updatedPayloads: unknown[];
}

function createFakeUpdateSupabase(
  options: {
    duplicateRows?: DupRow[];
    duplicateError?: { message: string } | null;
    updatedRows?: unknown[];
    updateError?: { message: string } | null;
  } = {},
): FakeUpdateHandle {
  const duplicateEqCalls: Array<[string, unknown]> = [];
  const ilikeCalls: Array<[string, unknown]> = [];
  const updateEqCalls: Array<[string, unknown]> = [];
  const updatedPayloads: unknown[] = [];
  const baseRows = options.duplicateRows ?? [];

  const client = {
    from(table: string) {
      if (table !== 'dictionary_terms') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (col1: string, val1: unknown) => {
            duplicateEqCalls.push([col1, val1]);
            return {
              eq: (col2: string, val2: unknown) => {
                duplicateEqCalls.push([col2, val2]);
                // create fake와 같은 hybrid — 새 구현은 바로 await, 옛 구현은 `.ilike()` 호출.
                const resultPromise = Promise.resolve({
                  data: options.duplicateError ? null : baseRows,
                  error: options.duplicateError ?? null,
                }) as Promise<{ data: DupRow[] | null; error: { message: string } | null }> & {
                  ilike: (col: string, val: unknown) => Promise<unknown>;
                };
                resultPromise.ilike = (col3: string, val3: unknown) => {
                  ilikeCalls.push([col3, val3]);
                  if (options.duplicateError) {
                    return Promise.resolve({ data: null, error: options.duplicateError });
                  }
                  const filtered = baseRows.filter((row) =>
                    ilikePatternMatches(String(val3), row.source_text),
                  );
                  return Promise.resolve({ data: filtered, error: null });
                };
                return resultPromise;
              },
            };
          },
        }),
        update: (row: unknown) => {
          updatedPayloads.push(row);
          return {
            eq: (col1: string, val1: unknown) => {
              updateEqCalls.push([col1, val1]);
              return {
                eq: (col2: string, val2: unknown) => {
                  updateEqCalls.push([col2, val2]);
                  return {
                    select: () =>
                      Promise.resolve({
                        data: options.updateError ? null : (options.updatedRows ?? []),
                        error: options.updateError ?? null,
                      }),
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, duplicateEqCalls, ilikeCalls, updateEqCalls, updatedPayloads };
}

describe('updateDictionaryEntry — AC-016/AC-047', () => {
  it('중복이 없으면 id·owner_user_id로 스코프해 update하고 갱신된 엔트리를 반환한다', async () => {
    const { client, updateEqCalls, updatedPayloads } = createFakeUpdateSupabase({
      duplicateRows: [],
      updatedRows: [
        {
          id: 'entry-1',
          entry_type: 'term',
          source_text: 'SLA',
          target_text: '변경됨',
          ko_honorific: null,
          en_honorific: null,
          note: null,
        },
      ],
    });

    const result = await updateDictionaryEntry(client, 'user-1', 'entry-1', {
      entryType: 'term',
      sourceText: 'SLA',
      targetText: '변경됨',
    });

    expect(updateEqCalls).toEqual([
      ['id', 'entry-1'],
      ['owner_user_id', 'user-1'],
    ]);
    expect(updatedPayloads[0]).toMatchObject({ source_text: 'SLA', target_text: '변경됨' });
    expect(result.targetText).toBe('변경됨');
  });

  it('자기 자신을 제외하고 같은 sourceText와 중복되면(자기 자신은 예외) DuplicateEntryError를 던지지 않는다', async () => {
    const { client } = createFakeUpdateSupabase({
      duplicateRows: [{ id: 'entry-1', source_text: 'SLA' }], // 조회된 중복 후보가 자기 자신뿐
      updatedRows: [
        {
          id: 'entry-1',
          entry_type: 'term',
          source_text: 'SLA',
          target_text: null,
          ko_honorific: null,
          en_honorific: null,
          note: null,
        },
      ],
    });

    await expect(
      updateDictionaryEntry(client, 'user-1', 'entry-1', { entryType: 'term', sourceText: 'SLA' }),
    ).resolves.toMatchObject({ id: 'entry-1' });
  });

  it('다른 엔트리와 중복되면 DuplicateEntryError를 던지고 update하지 않는다', async () => {
    const { client, updatedPayloads } = createFakeUpdateSupabase({
      duplicateRows: [{ id: 'other-entry', source_text: 'SLA' }],
    });

    await expect(
      updateDictionaryEntry(client, 'user-1', 'entry-1', { entryType: 'term', sourceText: 'sla' }),
    ).rejects.toMatchObject({ code: 'CONFLICT_DUPLICATE_ENTRY', message: '이미 등록된 용어입니다' });
    expect(updatedPayloads).toHaveLength(0);
  });

  it('C-1 — LIKE 메타문자(%)를 포함한 값으로 수정해도 다른 항목과 오탐 중복되지 않는다', async () => {
    const { client, updatedPayloads } = createFakeUpdateSupabase({
      duplicateRows: [{ id: 'other-entry', source_text: '100% 달성' }],
      updatedRows: [
        {
          id: 'entry-1',
          entry_type: 'term',
          source_text: '100%',
          target_text: null,
          ko_honorific: null,
          en_honorific: null,
          note: null,
        },
      ],
    });

    await expect(
      updateDictionaryEntry(client, 'user-1', 'entry-1', { entryType: 'term', sourceText: '100%' }),
    ).resolves.toMatchObject({ sourceText: '100%' });
    expect(updatedPayloads).toHaveLength(1);
  });

  it('대상이 없으면(존재하지 않거나 타인 소유) NotFoundError를 던진다', async () => {
    const { client } = createFakeUpdateSupabase({ duplicateRows: [], updatedRows: [] });

    await expect(
      updateDictionaryEntry(client, 'user-1', 'missing-id', {
        entryType: 'term',
        sourceText: 'SLA',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('update 실패 시 에러를 던진다(에러 삼키기 금지)', async () => {
    const { client } = createFakeUpdateSupabase({
      duplicateRows: [],
      updateError: { message: 'connection failed' },
    });

    await expect(
      updateDictionaryEntry(client, 'user-1', 'entry-1', { entryType: 'term', sourceText: 'SLA' }),
    ).rejects.toEqual({ message: 'connection failed' });
  });
});

// T23 — 삭제(DELETE /api/dictionary/{id}). AC-016.
interface FakeDeleteHandle {
  client: SupabaseClient;
  eqCalls: Array<[string, unknown]>;
}

function createFakeDeleteSupabase(
  options: { deletedRows?: unknown[]; error?: { message: string } | null } = {},
): FakeDeleteHandle {
  const eqCalls: Array<[string, unknown]> = [];
  const client = {
    from(table: string) {
      if (table !== 'dictionary_terms') throw new Error(`unexpected table: ${table}`);
      return {
        delete: () => ({
          eq: (col1: string, val1: unknown) => {
            eqCalls.push([col1, val1]);
            return {
              eq: (col2: string, val2: unknown) => {
                eqCalls.push([col2, val2]);
                return {
                  select: () =>
                    Promise.resolve({
                      data: options.error ? null : (options.deletedRows ?? []),
                      error: options.error ?? null,
                    }),
                };
              },
            };
          },
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { client, eqCalls };
}

describe('deleteDictionaryEntry — AC-016', () => {
  it('id와 owner_user_id 둘 다로 스코프해 삭제한다(타인 소유 방지)', async () => {
    const { client, eqCalls } = createFakeDeleteSupabase({ deletedRows: [{ id: 'entry-1' }] });

    await deleteDictionaryEntry(client, 'user-1', 'entry-1');

    expect(eqCalls).toEqual([
      ['id', 'entry-1'],
      ['owner_user_id', 'user-1'],
    ]);
  });

  it('삭제된 행이 0개면(존재하지 않거나 타인 소유) NotFoundError를 던진다', async () => {
    const { client } = createFakeDeleteSupabase({ deletedRows: [] });

    await expect(deleteDictionaryEntry(client, 'user-1', 'entry-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('삭제 실패 시 원본 에러를 던진다(에러 삼키기 금지)', async () => {
    const { client } = createFakeDeleteSupabase({ error: { message: 'connection failed' } });

    await expect(deleteDictionaryEntry(client, 'user-1', 'entry-1')).rejects.toEqual({
      message: 'connection failed',
    });
  });
});
