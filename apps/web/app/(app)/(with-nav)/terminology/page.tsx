'use client';

/**
 * UX-010 Terminology Dictionary Management Screen — `docs/UX.md` "Terminology Dictionary
 * Management Screen (Screen ID: UX-010)". AC-015(뒷단 — C5가 소비, 이 화면은 CRUD만),
 * AC-016(대소문자 무시 중복 차단), AC-047(호칭 3필드). `docs/Tasks.md` T23.
 *
 * States(UX-010 States): Loading(skeleton) / Empty("등록된 용어가 없습니다. 첫 용어를 추가하세요")
 * / Error(재시도) / Success(목록, 각 항목이 텍스트로 유형 태그를 보여준다 — 아이콘/색만으로
 * 구분하지 않는다, Accessibility 요구).
 *
 * 🔴 편집/삭제 상호배타(T21 `profile/page.tsx` F-1류 리뷰 교훈을 선제 적용, 태스크 지시 참고):
 * 한 행에서 편집과 삭제-확인은 동시에 열리지 않는다(하나를 시작하면 다른 하나를 닫는다) —
 * `startEdit()`/`requestDelete()` 참조. 삭제가 진행 중인 동안(`deleting`, 페이지 레벨 플래그 —
 * `profile/page.tsx`와 같은 선택, 리뷰 승인 전례) 같은 행의 수정 버튼을 구조적으로 비활성화한다.
 * T21의 "다른 행 삭제가 이 행의 편집을 되살리는" 잔여 레이스는 이 화면에는 구조적으로 없다 —
 * `profiles`(단일 행, 필드별 PUT에 전체 스냅샷을 함께 보낸다)와 달리 `dictionary_terms`는
 * 엔트리별 독립 행이라 한 엔트리의 PUT/DELETE payload에 다른 엔트리의 값이 섞여 들어가지 않는다.
 */
import { useCallback, useEffect, useState } from 'react';
import styles from './terminology.module.css';

const LOAD_FAILED_MESSAGE = '불러오지 못했습니다, 다시 시도해주세요';
const EMPTY_MESSAGE = '등록된 용어가 없습니다. 첫 용어를 추가하세요';
const SAVE_FAILED_MESSAGE = '저장하지 못했습니다, 다시 시도해주세요';
const DELETE_FAILED_MESSAGE = '삭제하지 못했습니다, 다시 시도해주세요';
const CONFIRM_DELETE_MESSAGE = '삭제하시겠습니까?';
const HONORIFIC_REQUIRED_MESSAGE = '한국어 호칭 또는 영어 호칭 중 하나는 입력해주세요';
const DUPLICATE_MESSAGE: Record<EntryType, string> = {
  term: '이미 등록된 용어입니다',
  person: '이미 등록된 인물입니다',
};

type EntryType = 'term' | 'person';

interface DictionaryEntryDetail {
  id: string;
  entryType: EntryType;
  sourceText: string;
  targetText: string | null;
  koHonorific: string | null;
  enHonorific: string | null;
  note: string | null;
}

interface EntryFormFields {
  sourceText: string;
  targetText: string;
  koHonorific: string;
  enHonorific: string;
}

const EMPTY_FORM_FIELDS: EntryFormFields = {
  sourceText: '',
  targetText: '',
  koHonorific: '',
  enHonorific: '',
};

const TYPE_LABEL: Record<EntryType, string> = { term: '용어', person: '사람·호칭' };
const SOURCE_TEXT_LABEL: Record<EntryType, string> = { term: '용어', person: '실명' };

/**
 * `entryType`·`fields`가 서버에 보낼 만큼 유효한지(=Add/Save 활성화 조건, UX-010 Validation
 * "Add/Save enabled only when the active entry type's required fields are valid **and
 * non-duplicate**").
 *
 * M-3(리뷰 지적) — `entries`(이미 로드된 목록)를 기준으로 같은 entryType·대소문자 무시
 * sourceText 중복을 클라이언트에서 선제 차단한다. `excludeId`가 있으면(수정 시) 자기 자신은
 * 후보에서 제외한다. 서버(`hasDuplicate`, `apps/web/lib/dictionary/storage.ts`)가 여전히
 * 최종 권한이다 — 이 프리체크는 Add/Save 버튼을 선제적으로 막는 용도일 뿐, 서버 측 검증을
 * 대체하지 않는다(로드된 목록이 최신이 아닐 수 있음).
 */
function validationError(
  entryType: EntryType,
  fields: EntryFormFields,
  entries: DictionaryEntryDetail[],
  excludeId?: string,
): string | null {
  if (!fields.sourceText.trim()) {
    return entryType === 'term' ? '용어를 입력해주세요' : '실명을 입력해주세요';
  }
  if (entryType === 'person' && !fields.koHonorific.trim() && !fields.enHonorific.trim()) {
    return HONORIFIC_REQUIRED_MESSAGE;
  }
  const normalized = fields.sourceText.trim().toLowerCase();
  const isDuplicate = entries.some(
    (entry) =>
      entry.id !== excludeId &&
      entry.entryType === entryType &&
      entry.sourceText.toLowerCase() === normalized,
  );
  if (isDuplicate) {
    return DUPLICATE_MESSAGE[entryType];
  }
  return null;
}

function buildRequestBody(entryType: EntryType, fields: EntryFormFields, note: string | null) {
  return {
    entryType,
    sourceText: fields.sourceText.trim(),
    targetText: entryType === 'term' ? fields.targetText.trim() || undefined : undefined,
    koHonorific: entryType === 'person' ? fields.koHonorific.trim() || undefined : undefined,
    enHonorific: entryType === 'person' ? fields.enHonorific.trim() || undefined : undefined,
    note: note ?? undefined,
  };
}

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function TerminologyPage() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [entries, setEntries] = useState<DictionaryEntryDetail[]>([]);

  const [newEntryType, setNewEntryType] = useState<EntryType>('term');
  const [newFields, setNewFields] = useState<EntryFormFields>(EMPTY_FORM_FIELDS);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEntryType, setEditEntryType] = useState<EntryType>('term');
  const [editFields, setEditFields] = useState<EntryFormFields>(EMPTY_FORM_FIELDS);
  const [editNote, setEditNote] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const response = await fetch('/api/dictionary');
      if (!response.ok) {
        setStatus('error');
        return;
      }
      const body = (await response.json()) as { items: DictionaryEntryDetail[] };
      setEntries(body.items);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  // fetch-on-mount — `profile/page.tsx`(T21)와 같은 이유로 이 한 줄만 억제한다(파일 헤더 주석 참조).
  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount, profile/page.tsx와 같은 근거 */
  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function retry() {
    setStatus('loading');
    void fetchEntries();
  }

  async function handleAdd() {
    const error = validationError(newEntryType, newFields, entries);
    if (error) {
      setAddError(error);
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const response = await fetch('/api/dictionary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildRequestBody(newEntryType, newFields, null)),
      });
      if (!response.ok) {
        setAddError(
          await extractErrorMessage(
            response,
            response.status === 409 ? DUPLICATE_MESSAGE[newEntryType] : SAVE_FAILED_MESSAGE,
          ),
        );
        return;
      }
      const created = (await response.json()) as DictionaryEntryDetail;
      setEntries((previous) => [...previous, created]);
      setNewFields(EMPTY_FORM_FIELDS);
    } catch {
      setAddError(SAVE_FAILED_MESSAGE);
    } finally {
      setAdding(false);
    }
  }

  function startEdit(entry: DictionaryEntryDetail) {
    // F-1 — 삭제 확인이 열린 채로 편집을 시작하면 확인을 닫는다(공존 방지, profile/page.tsx와 같은 이유).
    setDeleteTargetId(null);
    setRowErrors((previous) => ({ ...previous, [entry.id]: '' }));
    setEditingId(entry.id);
    setEditEntryType(entry.entryType);
    setEditFields({
      sourceText: entry.sourceText,
      targetText: entry.targetText ?? '',
      koHonorific: entry.koHonorific ?? '',
      enHonorific: entry.enHonorific ?? '',
    });
    setEditNote(entry.note);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditFields(EMPTY_FORM_FIELDS);
  }

  async function saveEdit() {
    if (!editingId) return;
    const id = editingId;
    const error = validationError(editEntryType, editFields, entries, id);
    if (error) {
      setRowErrors((previous) => ({ ...previous, [id]: error }));
      return;
    }
    setEditSaving(true);
    setRowErrors((previous) => ({ ...previous, [id]: '' }));
    try {
      const response = await fetch(`/api/dictionary/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildRequestBody(editEntryType, editFields, editNote)),
      });
      if (!response.ok) {
        const message =
          response.status === 409
            ? await extractErrorMessage(response, DUPLICATE_MESSAGE[editEntryType])
            : SAVE_FAILED_MESSAGE;
        setRowErrors((previous) => ({ ...previous, [id]: message }));
        return;
      }
      const updated = (await response.json()) as DictionaryEntryDetail;
      setEntries((previous) => previous.map((entry) => (entry.id === id ? updated : entry)));
      setEditingId(null);
      setEditFields(EMPTY_FORM_FIELDS);
    } catch {
      setRowErrors((previous) => ({ ...previous, [id]: SAVE_FAILED_MESSAGE }));
    } finally {
      setEditSaving(false);
    }
  }

  function requestDelete(id: string) {
    // F-1 — 반대 방향도 배타적이어야 한다: 편집 폼이 열린 채로 삭제를 시작하면 편집을 닫는다.
    setEditingId(null);
    setEditFields(EMPTY_FORM_FIELDS);
    setDeleteTargetId(id);
  }

  function cancelDelete() {
    setDeleteTargetId(null);
  }

  async function confirmDelete() {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleting(true);
    setRowErrors((previous) => ({ ...previous, [id]: '' }));
    try {
      const response = await fetch(`/api/dictionary/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        setRowErrors((previous) => ({ ...previous, [id]: DELETE_FAILED_MESSAGE }));
        return;
      }
      setEntries((previous) => previous.filter((entry) => entry.id !== id));
      setDeleteTargetId(null);
    } catch {
      setRowErrors((previous) => ({ ...previous, [id]: DELETE_FAILED_MESSAGE }));
    } finally {
      setDeleting(false);
    }
  }

  if (status === 'loading') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>용어사전</h1>
        <div className={styles.skeleton} aria-busy="true" aria-label="용어사전 불러오는 중">
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>용어사전</h1>
        <div role="alert" className={styles.banner}>
          <p>{LOAD_FAILED_MESSAGE}</p>
          <button type="button" className={styles.retryButton} onClick={retry}>
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  const addDisabled = adding || validationError(newEntryType, newFields, entries) !== null;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>용어사전</h1>
      <p className={styles.lead}>
        번역이 건드리면 안 되는 용어와 호칭을 등록합니다 — 등록한 그대로 유지됩니다.
      </p>

      <section className={styles.addSection} aria-label="용어 추가">
        <h2 className={styles.sectionTitle}>추가</h2>
        <div className={styles.typeChoice} role="group" aria-label="엔트리 타입">
          {(Object.keys(TYPE_LABEL) as EntryType[]).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={newEntryType === type}
              className={
                newEntryType === type
                  ? `${styles.typeButton} ${styles.typeButtonActive}`
                  : styles.typeButton
              }
              onClick={() => {
                setNewEntryType(type);
                setAddError(null);
              }}
            >
              {TYPE_LABEL[type]}
            </button>
          ))}
        </div>

        <div className={styles.field}>
          <label htmlFor="new-source-text">{SOURCE_TEXT_LABEL[newEntryType]}</label>
          <input
            id="new-source-text"
            type="text"
            value={newFields.sourceText}
            onChange={(event) => {
              const value = event.target.value;
              setNewFields((previous) => ({ ...previous, sourceText: value }));
              setAddError(null);
            }}
          />
        </div>

        {newEntryType === 'term' && (
          <div className={styles.field}>
            <label htmlFor="new-target-text">번역/대응어</label>
            <input
              id="new-target-text"
              type="text"
              value={newFields.targetText}
              onChange={(event) => {
                const value = event.target.value;
                setNewFields((previous) => ({ ...previous, targetText: value }));
                setAddError(null);
              }}
            />
          </div>
        )}

        {newEntryType === 'person' && (
          <>
            <div className={styles.field}>
              <label htmlFor="new-ko-honorific">한국어 호칭</label>
              <input
                id="new-ko-honorific"
                type="text"
                value={newFields.koHonorific}
                onChange={(event) => {
                  const value = event.target.value;
                  setNewFields((previous) => ({ ...previous, koHonorific: value }));
                  setAddError(null);
                }}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="new-en-honorific">영어 호칭</label>
              <input
                id="new-en-honorific"
                type="text"
                value={newFields.enHonorific}
                onChange={(event) => {
                  const value = event.target.value;
                  setNewFields((previous) => ({ ...previous, enHonorific: value }));
                  setAddError(null);
                }}
              />
            </div>
          </>
        )}

        <button type="button" className={styles.addButton} disabled={addDisabled} onClick={() => void handleAdd()}>
          추가
        </button>
        {addError && (
          <p role="alert" className={styles.errorText}>
            {addError}
          </p>
        )}
      </section>

      <section className={styles.section} aria-label="용어 목록">
        {entries.length === 0 && <p className={styles.emptyMessage}>{EMPTY_MESSAGE}</p>}
        <ul className={styles.list}>
          {entries.map((entry) => {
            const isEditing = editingId === entry.id;
            const isDeleteTarget = deleteTargetId === entry.id;
            const rowError = rowErrors[entry.id];

            return (
              <li key={entry.id} className={styles.item}>
                <div className={styles.itemHeader}>
                  <span className={styles.itemLabel}>{entry.sourceText}</span>
                  <span className={styles.tag}>{TYPE_LABEL[entry.entryType]}</span>
                </div>

                {!isEditing && (
                  <>
                    <span className={styles.itemValue}>
                      {entry.entryType === 'term'
                        ? (entry.targetText ?? '(번역/대응어 미등록)')
                        : `한국어: ${entry.koHonorific ?? '미등록'} · 영어: ${entry.enHonorific ?? '미등록'}`}
                    </span>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.editButton}
                        // F-1 재발 방지 — 삭제 진행 중(deleting)에는 수정 버튼을 비활성화한다
                        // (profile/page.tsx의 같은 방어와 같은 이유).
                        disabled={deleting}
                        onClick={() => startEdit(entry)}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        // M-1 — 이 행의 편집 저장(editSaving)이 진행 중인 동안에는 삭제도
                        // 막는다(반대 방향 F-1 재발 방지: PUT in-flight 중 DELETE 경합 방지).
                        disabled={deleting || editSaving}
                        onClick={() => requestDelete(entry.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </>
                )}

                {isEditing && (
                  <div className={styles.editForm}>
                    <div className={styles.field}>
                      <label htmlFor={`edit-source-text-${entry.id}`}>
                        {SOURCE_TEXT_LABEL[editEntryType]}
                      </label>
                      <input
                        id={`edit-source-text-${entry.id}`}
                        type="text"
                        value={editFields.sourceText}
                        onChange={(event) => {
                          const value = event.target.value;
                          setEditFields((previous) => ({ ...previous, sourceText: value }));
                          setRowErrors((previous) => ({ ...previous, [entry.id]: '' }));
                        }}
                      />
                    </div>

                    {editEntryType === 'term' && (
                      <div className={styles.field}>
                        <label htmlFor={`edit-target-text-${entry.id}`}>번역/대응어</label>
                        <input
                          id={`edit-target-text-${entry.id}`}
                          type="text"
                          value={editFields.targetText}
                          onChange={(event) => {
                            const value = event.target.value;
                            setEditFields((previous) => ({ ...previous, targetText: value }));
                            setRowErrors((previous) => ({ ...previous, [entry.id]: '' }));
                          }}
                        />
                      </div>
                    )}

                    {editEntryType === 'person' && (
                      <>
                        <div className={styles.field}>
                          <label htmlFor={`edit-ko-honorific-${entry.id}`}>한국어 호칭</label>
                          <input
                            id={`edit-ko-honorific-${entry.id}`}
                            type="text"
                            value={editFields.koHonorific}
                            onChange={(event) => {
                              const value = event.target.value;
                              setEditFields((previous) => ({ ...previous, koHonorific: value }));
                              setRowErrors((previous) => ({ ...previous, [entry.id]: '' }));
                            }}
                          />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor={`edit-en-honorific-${entry.id}`}>영어 호칭</label>
                          <input
                            id={`edit-en-honorific-${entry.id}`}
                            type="text"
                            value={editFields.enHonorific}
                            onChange={(event) => {
                              const value = event.target.value;
                              setEditFields((previous) => ({ ...previous, enHonorific: value }));
                              setRowErrors((previous) => ({ ...previous, [entry.id]: '' }));
                            }}
                          />
                        </div>
                      </>
                    )}

                    <div className={styles.editActions}>
                      <button
                        type="button"
                        className={styles.saveButton}
                        // M-3 — Add와 동일 기준: 클라이언트 선제 중복/검증 체크가 걸리면
                        // 저장 버튼을 미리 비활성화한다(서버 왕복 없이).
                        disabled={
                          editSaving ||
                          validationError(editEntryType, editFields, entries, editingId ?? undefined) !==
                            null
                        }
                        onClick={() => void saveEdit()}
                      >
                        저장
                      </button>
                      <button type="button" className={styles.cancelButton} onClick={cancelEdit}>
                        취소
                      </button>
                      {/* F-1(b) — 편집이 열린 상태에서도 삭제로 전환할 수 있어야 한다(편집 폼을
                          닫고 삭제 확인을 연다, requestDelete() 참조). */}
                      <button
                        type="button"
                        className={styles.deleteButton}
                        // M-1 — 이 행의 저장(editSaving)이 진행 중인 동안에는 삭제도 막는다.
                        disabled={deleting || editSaving}
                        onClick={() => requestDelete(entry.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}

                {rowError && (
                  <p role="alert" className={styles.errorText}>
                    {rowError}
                  </p>
                )}

                {isDeleteTarget && (
                  <div role="alert" className={styles.confirmBox}>
                    <p>{CONFIRM_DELETE_MESSAGE}</p>
                    <div className={styles.confirmActions}>
                      <button
                        type="button"
                        className={styles.confirmDeleteButton}
                        // M-1 — 편집 저장(editSaving)이 진행 중인 동안에는 확인 클릭도 막는다.
                        disabled={deleting || editSaving}
                        onClick={() => void confirmDelete()}
                      >
                        삭제
                      </button>
                      <button type="button" className={styles.cancelButton} onClick={cancelDelete}>
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
