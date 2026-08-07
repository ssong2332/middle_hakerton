'use client';

/**
 * UX-009 Profile Management Screen — `docs/UX.md` Screen Catalog "Profile Management Screen
 * (Screen ID: UX-009)". AC-014 (screen), AC-012/AC-013 (backend behaviors surfaced here),
 * AC-046 (honorific-level item), AC-059 (skipped/empty profile + resume path). `docs/Tasks.md` T21.
 *
 * States(`docs/UX.md` UX-009 States): Loading(skeleton) / SkippedProfile(온보딩 건너뜀 —
 * "온보딩 완료하기" 액션) / Empty(학습된 항목 0건, 자기신고 항목은 계속 보임) / Error(재시도) /
 * Success(자기신고 4항목 + 학습된 항목 목록). Empty와 Success는 같은 "본문" 렌더 트리 안에서
 * 학습 항목 섹션만 달라진다 — 자기신고 4항목은 `onboardingState==='completed'`면 항상 보인다
 * (UX.md Empty 설명 "self-report exists but no diff pattern has reached 3 repeats yet" — 자기신고
 * 자체가 사라지는 상태가 아니다).
 *
 * 🔴 `(with-nav)` 레이아웃의 `enforceOnboardingRedirect()`가 `onboardingState==='not_started'`
 * 계정은 이미 `/onboarding`으로 돌려보낸다 — 이 화면에 도달했는데 프로필이 비어 있다면 사실상
 * `skipped`뿐이다. 그래도 이 화면 안에서 "삭제"로 되돌린 직후(서버 재내비게이션 없이)는 클라이언트
 * 상태가 `not_started`가 될 수 있으므로, SkippedProfile 분기는 `onboardingState !== 'completed'`
 * 전체를 포괄한다(스킵과 미시작을 화면에서 다른 문구로 나누지 않는다 — 둘 다 "비어 있고 온보딩으로
 * 돌아가야 함"이라는 같은 처방이다).
 *
 * 🔴 Edit/Delete가 있는 항목은 **자기신고 4항목뿐**이다 — `PUT /api/profile`만으로 표현 가능하다
 * (편집: 그 필드만 바꿔 전체를 다시 보낸다. 삭제: 그 필드를 생략해 `null`로 되돌리고 나머지는
 * 그대로 다시 보낸다 — `saveOnboardingProfile`이 "보내지 않은 필드는 null"로 취급하므로, 편집·
 * 삭제 모두 현재 값 전체를 함께 실어 보내야 다른 필드가 같이 지워지지 않는다). 학습된 항목은
 * `docs/API.md`에 PUT 엔드포인트가 없다 — View + Delete만 지원한다(`DELETE
 * /api/profile/learned/{id}`).
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './profile.module.css';

const ONBOARDING_ROUTE = '/onboarding';
const LOAD_FAILED_MESSAGE = '불러오지 못했습니다, 다시 시도해주세요';
const FIELD_SAVE_FAILED_MESSAGE = '저장하지 못했습니다, 다시 시도해주세요';
const FIELD_DELETE_FAILED_MESSAGE = '삭제하지 못했습니다, 다시 시도해주세요';
const EMPTY_VALUE_ERROR = '값을 선택해주세요';
const CONFIRM_DELETE_MESSAGE = '삭제하시겠습니까?';

type Directness = 'direct' | 'indirect';
type EmojiPreference = 'likes' | 'neutral' | 'avoids';
type Formality = 'high' | 'medium' | 'low';
type HonorificLevel = 'hapsyo' | 'haeyo';
type FieldKey = 'directness' | 'emojiPreference' | 'formality' | 'honorificLevel';

interface StyleFields {
  directness: Directness | null;
  emojiPreference: EmojiPreference | null;
  formality: Formality | null;
  honorificLevel: HonorificLevel | null;
}

interface ProfileState extends StyleFields {
  onboardingState: 'not_started' | 'skipped' | 'completed';
}

interface LearnedItem {
  id: string;
  patternKey: string;
  value: string;
}

const FIELD_ORDER: FieldKey[] = ['directness', 'emojiPreference', 'formality', 'honorificLevel'];

const FIELD_LABELS: Record<FieldKey, string> = {
  directness: '직설/완곡',
  emojiPreference: '이모지 선호',
  formality: '격식도',
  honorificLevel: '존댓말 레벨',
};

const FIELD_OPTIONS: Record<FieldKey, { value: string; label: string }[]> = {
  directness: [
    { value: 'direct', label: '직설적으로 표현하는 편이에요' },
    { value: 'indirect', label: '완곡하게 표현하는 편이에요' },
  ],
  emojiPreference: [
    { value: 'likes', label: '자주 써요' },
    { value: 'neutral', label: '가끔 써요' },
    { value: 'avoids', label: '거의 안 써요' },
  ],
  formality: [
    { value: 'high', label: '격식 있게' },
    { value: 'medium', label: '보통' },
    { value: 'low', label: '편하게' },
  ],
  honorificLevel: [
    { value: 'hapsyo', label: '합쇼체 (합니다/입니다)' },
    { value: 'haeyo', label: '해요체 (해요/이에요)' },
  ],
};

function fieldValueLabel(key: FieldKey, value: string | null): string {
  if (value === null) return '미설정';
  return FIELD_OPTIONS[key].find((option) => option.value === value)?.label ?? value;
}

type DeleteTarget = { type: 'field'; key: FieldKey } | { type: 'learned'; id: string };

export default function ProfilePage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [learnedItems, setLearnedItems] = useState<LearnedItem[]>([]);

  const [editingField, setEditingField] = useState<FieldKey | null>(null);
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [learnedErrors, setLearnedErrors] = useState<Record<string, string>>({});

  // 이 함수는 시작 시점에 `setStatus('loading')`을 두지 않는다 — `status`의 초기값이 이미
  // `'loading'`이라 마운트 시점에는 필요 없고, 재시도 시점에는 `retry()`가 이벤트 핸들러
  // 안에서(이펙트 밖) 먼저 `setStatus('loading')`을 호출한 뒤 이 함수를 부른다.
  const fetchProfileAndLearned = useCallback(async () => {
    try {
      const [profileResponse, learnedResponse] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/profile/learned'),
      ]);
      if (!profileResponse.ok || !learnedResponse.ok) {
        setStatus('error');
        return;
      }
      const profileBody = (await profileResponse.json()) as ProfileState;
      const learnedBody = (await learnedResponse.json()) as { items: LearnedItem[] };
      setProfile(profileBody);
      setLearnedItems(learnedBody.items);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  // 🔴 `react-hooks/set-state-in-effect`는 이 리포의 첫 fetch-on-mount 이펙트다(기존 관례 없음).
  // 이 규칙은 useEffect 콜백의 호출 그래프 전체에서 setState 호출이 "도달 가능"하기만 하면
  // 경고한다 — `await` 뒤에서만 호출되는지(React가 실제로 문제 삼는 "렌더 중 동기 setState")는
  // 구분하지 않는다(measured: 위 `fetchProfileAndLearned`가 첫 문장에서 곧장 `await`로 시작해도
  // 여전히 flag됨). React 공식 문서가 "Fetching data"를 이펙트의 정당한 용례로 드는 것과 이
  // 정적 근사 사이의 간극이며, `docs/CodingRules.md`에 이 상황(마운트 시 fetch)에 대한 다른
  // 지침이 없다 — 한 줄만 명시적으로 억제한다(규칙 전체를 끄지 않는다).
  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount, 위 근거 참조 */
  useEffect(() => {
    void fetchProfileAndLearned();
  }, [fetchProfileAndLearned]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function retry() {
    setStatus('loading');
    void fetchProfileAndLearned();
  }

  function startEdit(key: FieldKey) {
    setFieldErrors((previous) => ({ ...previous, [key]: undefined }));
    setEditingField(key);
    setEditDraft(profile ? profile[key] : null);
  }

  function cancelEdit() {
    setEditingField(null);
    setEditDraft(null);
  }

  async function saveEdit() {
    if (!profile || !editingField) return;
    if (editDraft === null) {
      setFieldErrors((previous) => ({ ...previous, [editingField]: EMPTY_VALUE_ERROR }));
      return;
    }
    const key = editingField;
    setEditSaving(true);
    setFieldErrors((previous) => ({ ...previous, [key]: undefined }));
    try {
      const body = {
        onboardingState: 'completed' as const,
        directness: profile.directness ?? undefined,
        emojiPreference: profile.emojiPreference ?? undefined,
        formality: profile.formality ?? undefined,
        honorificLevel: profile.honorificLevel ?? undefined,
        [key]: editDraft,
      };
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setFieldErrors((previous) => ({ ...previous, [key]: FIELD_SAVE_FAILED_MESSAGE }));
        return;
      }
      setProfile((previous) => (previous ? { ...previous, [key]: editDraft } : previous));
      setEditingField(null);
      setEditDraft(null);
    } catch {
      setFieldErrors((previous) => ({ ...previous, [key]: FIELD_SAVE_FAILED_MESSAGE }));
    } finally {
      setEditSaving(false);
    }
  }

  function requestDeleteField(key: FieldKey) {
    setDeleteTarget({ type: 'field', key });
  }

  function requestDeleteLearned(id: string) {
    setDeleteTarget({ type: 'learned', id });
  }

  function cancelDelete() {
    setDeleteTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === 'field') {
        await deleteField(deleteTarget.key);
      } else {
        await deleteLearned(deleteTarget.id);
      }
    } finally {
      setDeleting(false);
    }
  }

  async function deleteField(key: FieldKey) {
    if (!profile) return;
    setFieldErrors((previous) => ({ ...previous, [key]: undefined }));
    try {
      const fields: StyleFields = {
        directness: profile.directness,
        emojiPreference: profile.emojiPreference,
        formality: profile.formality,
        honorificLevel: profile.honorificLevel,
      };
      const body: Record<string, string | undefined> = { onboardingState: 'completed' };
      for (const otherKey of FIELD_ORDER) {
        if (otherKey === key) continue;
        body[otherKey] = fields[otherKey] ?? undefined;
      }
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setFieldErrors((previous) => ({ ...previous, [key]: FIELD_DELETE_FAILED_MESSAGE }));
        return;
      }
      setProfile((previous) => (previous ? { ...previous, [key]: null } : previous));
      setDeleteTarget(null);
    } catch {
      setFieldErrors((previous) => ({ ...previous, [key]: FIELD_DELETE_FAILED_MESSAGE }));
    }
  }

  async function deleteLearned(id: string) {
    setLearnedErrors((previous) => ({ ...previous, [id]: '' }));
    try {
      const response = await fetch(`/api/profile/learned/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        setLearnedErrors((previous) => ({ ...previous, [id]: FIELD_DELETE_FAILED_MESSAGE }));
        return;
      }
      setLearnedItems((previous) => previous.filter((item) => item.id !== id));
      setDeleteTarget(null);
    } catch {
      setLearnedErrors((previous) => ({ ...previous, [id]: FIELD_DELETE_FAILED_MESSAGE }));
    }
  }

  if (status === 'loading') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>프로필</h1>
        <div className={styles.skeleton} aria-busy="true" aria-label="프로필 불러오는 중">
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
        <h1 className={styles.title}>프로필</h1>
        <div role="alert" className={styles.banner}>
          <p>{LOAD_FAILED_MESSAGE}</p>
          <button type="button" className={styles.retryButton} onClick={retry}>
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  if (!profile) return null;

  const isSkippedOrEmpty = profile.onboardingState !== 'completed';

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>프로필</h1>
      <p className={styles.lead}>학습된 커뮤니케이션 스타일을 확인하고 수정·삭제할 수 있습니다.</p>

      {isSkippedOrEmpty && (
        <div className={styles.skippedBox}>
          <p className={styles.skippedMessage}>
            온보딩을 건너뛰었습니다 — 개인화가 꺼져 있습니다
          </p>
          <button
            type="button"
            className={styles.completeOnboardingButton}
            onClick={() => router.push(ONBOARDING_ROUTE)}
          >
            온보딩 완료하기
          </button>
        </div>
      )}

      {!isSkippedOrEmpty && (
        <section className={styles.section} aria-label="자기신고 항목">
          <h2 className={styles.sectionTitle}>자기신고 항목</h2>
          <ul className={styles.list}>
            {FIELD_ORDER.map((key) => (
              <li key={key} className={styles.item}>
                <div className={styles.itemHeader}>
                  <span className={styles.itemLabel}>{FIELD_LABELS[key]}</span>
                  <span className={styles.tag}>자기신고</span>
                </div>

                {editingField !== key && (
                  <>
                    <span className={styles.itemValue}>
                      {fieldValueLabel(key, profile[key])}
                    </span>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => startEdit(key)}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => requestDeleteField(key)}
                      >
                        삭제
                      </button>
                    </div>
                  </>
                )}

                {editingField === key && (
                  <div className={styles.editForm}>
                    {FIELD_OPTIONS[key].map((option) => (
                      <label key={option.value}>
                        <input
                          type="radio"
                          name={`edit-${key}`}
                          checked={editDraft === option.value}
                          onChange={() => setEditDraft(option.value)}
                        />
                        {option.label}
                      </label>
                    ))}
                    <div className={styles.editActions}>
                      <button
                        type="button"
                        className={styles.saveButton}
                        disabled={editSaving}
                        onClick={() => void saveEdit()}
                      >
                        저장
                      </button>
                      <button type="button" className={styles.cancelButton} onClick={cancelEdit}>
                        취소
                      </button>
                    </div>
                  </div>
                )}

                {fieldErrors[key] && (
                  <p role="alert" className={styles.errorText}>
                    {fieldErrors[key]}
                  </p>
                )}

                {deleteTarget?.type === 'field' && deleteTarget.key === key && (
                  <div role="alert" className={styles.confirmBox}>
                    <p>{CONFIRM_DELETE_MESSAGE}</p>
                    <div className={styles.confirmActions}>
                      <button
                        type="button"
                        className={styles.confirmDeleteButton}
                        disabled={deleting}
                        onClick={() => void confirmDelete()}
                      >
                        삭제
                      </button>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={cancelDelete}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isSkippedOrEmpty && (
        <section className={styles.section} aria-label="학습된 항목">
          <h2 className={styles.sectionTitle}>학습된 항목</h2>
          {learnedItems.length === 0 && (
            <p className={styles.emptyMessage}>아직 학습된 항목이 없습니다</p>
          )}
          {learnedItems.length > 0 && (
            <ul className={styles.list}>
              {learnedItems.map((item) => (
                <li key={item.id} className={styles.item}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemLabel}>{item.patternKey}</span>
                    <span className={styles.tag}>학습됨</span>
                  </div>
                  <span className={styles.itemValue}>{item.value}</span>
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => requestDeleteLearned(item.id)}
                    >
                      삭제
                    </button>
                  </div>

                  {learnedErrors[item.id] && (
                    <p role="alert" className={styles.errorText}>
                      {learnedErrors[item.id]}
                    </p>
                  )}

                  {deleteTarget?.type === 'learned' && deleteTarget.id === item.id && (
                    <div role="alert" className={styles.confirmBox}>
                      <p>{CONFIRM_DELETE_MESSAGE}</p>
                      <div className={styles.confirmActions}>
                        <button
                          type="button"
                          className={styles.confirmDeleteButton}
                          disabled={deleting}
                          onClick={() => void confirmDelete()}
                        >
                          삭제
                        </button>
                        <button
                          type="button"
                          className={styles.cancelButton}
                          onClick={cancelDelete}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
