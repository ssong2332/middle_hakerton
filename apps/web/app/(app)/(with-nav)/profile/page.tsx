'use client';

/**
 * UX-009 Profile Management Screen — `docs/UX.md` Screen Catalog "Profile Management Screen
 * (Screen ID: UX-009)". AC-014 (screen), AC-012/AC-013 (backend behaviors surfaced here),
 * AC-046 (honorific-level item), AC-059 (skipped/empty profile + resume path). `docs/Tasks.md` T21.
 *
 * States(`docs/UX.md` UX-009 States): Loading(skeleton) / SkippedProfile 계열(개인화-꺼짐
 * 배너 — "온보딩 완료하기" 액션) / Empty(학습된 항목 0건) / Error(재시도) / Success(차원별 1행,
 * `docs/UX.md:577` "full list shown ..., each item tagged 자기신고 or 학습됨" — 자기신고 목록과
 * 학습된 항목 목록이 분리된 두 리스트가 아니라, 4개 차원(직설/완곡·이모지 선호·격식도·존댓말
 * 레벨) 각각 한 행이며 그 차원에 학습된 값이 있으면 그 행이 "학습됨"으로 대체된다(리뷰 M-2)).
 *
 * 🔴 (리뷰 M-1) 패턴 학습(`applyPatternLearningSafe`,
 * `apps/web/app/api/messages/route.ts`)은 `onboardingState`와 무관하게 항상 실행된다
 * (`apps/web/lib/messages/pattern-learning.ts` — 임계값만 확인, 온보딩 상태는 보지 않는다).
 * 그래서 스킵/미시작 사용자도 `profile_learned_items` 행을 가질 수 있다 — 이 화면은 그 행을
 * `onboardingState`로 가리지 않는다. 아래 차원 목록(위 Success 문단)은 항상 렌더되고,
 * `isSkippedOrEmpty`는 오직 "개인화가 꺼져 있습니다" 배너의 노출 여부만 제어한다(M-3 참고,
 * 자기신고 값이 비어 있어도 학습된 값은 여전히 보이고 지울 수 있어야 한다).
 *
 * 🔴 (리뷰 M-4) `not_started`가 이 화면에 도달하는 이유는 이 화면 자신이 `DELETE /api/profile`을
 * 호출해서가 아니다(그런 라우트를 이 화면은 호출하지 않는다 — 아래 참고). 진짜 이유는
 * `apps/web/lib/onboarding-guard.ts`의 `enforceOnboardingRedirect()`가 DB/config 오류에
 * **fail-open**이기 때문이다(`onboarding-guard.ts:22-32`) — 그 실패 시 리다이렉트 없이 통과하므로
 * 실제로 온보딩을 한 번도 완료하지 않은 사용자가 이 화면에 도달할 수 있다. `not_started`는
 * "건너뛰었다"가 아니라 "아직 완료하지 않았다"이므로 `skipped`와 다른 문구를 쓴다.
 *
 * 🔴 Edit/Delete가 있는 항목은 **자기신고 값을 보여주는 행뿐**이다 — `PUT /api/profile`만으로
 * 표현 가능하다(편집: 그 필드만 바꿔 전체를 다시 보낸다. 삭제: 그 필드를 생략해 `null`로 되돌리고
 * 나머지는 그대로 다시 보낸다 — `saveOnboardingProfile`이 "보내지 않은 필드는 null"로 취급하므로,
 * 편집·삭제 모두 현재 값 전체를 함께 실어 보내야 다른 필드가 같이 지워지지 않는다). 학습된 값이
 * 표시 중인 행은 `docs/API.md`에 PUT 엔드포인트가 없어 View + Delete만 지원한다(`DELETE
 * /api/profile/learned/{id}`) — 이 화면은 그 행에서 "수정" 버튼을 아예 렌더하지 않는다.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { profileValueForPattern } from '@cross-border/core';
import styles from './profile.module.css';

const ONBOARDING_ROUTE = '/onboarding';
const LOAD_FAILED_MESSAGE = '불러오지 못했습니다, 다시 시도해주세요';
const FIELD_SAVE_FAILED_MESSAGE = '저장하지 못했습니다, 다시 시도해주세요';
const FIELD_DELETE_FAILED_MESSAGE = '삭제하지 못했습니다, 다시 시도해주세요';
const EMPTY_VALUE_ERROR = '값을 선택해주세요';
const CONFIRM_DELETE_MESSAGE = '삭제하시겠습니까?';
// M-4 — `not_started`는 "건너뛰었다"가 아니라 "아직 완료하지 않았다"이므로 별도 문구를 쓴다.
// `skipped`와 "completed인데 자기신고 4항목이 모두 null"(M-3)은 같은 문구를 공유한다 — 두 경우
// 모두 "자기신고로 채워질 값이 없다"는 같은 사실이며, 이 이상의 세분화는 이번 수정 범위 밖이다.
const SKIPPED_MESSAGE = '온보딩을 건너뛰었습니다 — 개인화가 꺼져 있습니다';
const NOT_STARTED_MESSAGE = '온보딩이 아직 완료되지 않았습니다 — 개인화가 꺼져 있습니다';

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

// M-2 — `packages/core/src/rules/pattern-detection.ts`가 만드는 `pattern_key`가 어느 자기신고
// 차원에 대응하는지의 어휘. `formality`/`honorificLevel`은 diff로 학습되는 필드가 아니므로
// (core의 `profileValueForPattern`이 두 값만 만든다) 이 표에 없다 — 항상 "자기신고"로 남는다.
const PATTERN_TO_FIELD: Record<string, FieldKey> = {
  emoji_removed: 'emojiPreference',
  cushion_insert: 'directness',
};

/** `key` 차원에 대응하는 학습 항목(있다면 하나) — 원시 patternKey를 화면에 그대로 노출하지 않고,
 * 이 항목을 찾아 그 차원의 자기신고 행을 대체하는 데만 쓴다(M-2). */
function learnedItemForField(key: FieldKey, items: LearnedItem[]): LearnedItem | undefined {
  return items.find((item) => PATTERN_TO_FIELD[item.patternKey] === key);
}

/** 학습 항목의 `patternKey`가 가리키는 `profiles` 어휘 값 — `profileValueForPattern`(core)이
 * 유일한 통로다. 분류 불가(core가 만들지 않는 값)면 `null`(지어내지 않는다). */
function learnedDisplayValue(item: LearnedItem): string | null {
  if (item.patternKey === 'emoji_removed' || item.patternKey === 'cushion_insert') {
    return profileValueForPattern(item.patternKey);
  }
  return null;
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

  // M-3 — `onboardingState`만으로 판정하면 "completed이지만 자기신고 4항목을 전부 삭제한" 상태를
  // 놓친다(`deleteField`가 필드별로 null로 되돌릴 뿐 `onboardingState`는 그대로 두므로 이 상태에
  // 도달할 수 있다). `docs/UX.md:926` Personalization-off indicator는 "개인화 입력이 없을 때는
  // 언제나"이므로, 상태값과 별개로 실제 4개 필드가 모두 null인지도 함께 본다.
  const allStyleFieldsNull = FIELD_ORDER.every((key) => profile[key] === null);
  const isSkippedOrEmpty = profile.onboardingState !== 'completed' || allStyleFieldsNull;
  const bannerMessage =
    profile.onboardingState === 'not_started' ? NOT_STARTED_MESSAGE : SKIPPED_MESSAGE;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>프로필</h1>
      <p className={styles.lead}>학습된 커뮤니케이션 스타일을 확인하고 수정·삭제할 수 있습니다.</p>

      {isSkippedOrEmpty && (
        <div className={styles.skippedBox}>
          <p className={styles.skippedMessage}>{bannerMessage}</p>
          <button
            type="button"
            className={styles.completeOnboardingButton}
            onClick={() => router.push(ONBOARDING_ROUTE)}
          >
            온보딩 완료하기
          </button>
        </div>
      )}

      {/* M-1 — 이 섹션은 `isSkippedOrEmpty`로 가리지 않는다. 패턴 학습은 온보딩 상태와 무관하게
          실행되므로, 스킵/미시작 사용자도 학습된 값을 보고 지울 수 있어야 한다(파일 헤더 주석
          참고). 위 배너는 "자기신고 입력이 비어 있다"는 사실만 알릴 뿐, 학습된 값의 열람·삭제를
          막을 이유가 되지 않는다. */}
      <section className={styles.section} aria-label="프로필 항목">
        <h2 className={styles.sectionTitle}>프로필 항목</h2>
        {learnedItems.length === 0 && (
          <p className={styles.emptyMessage}>아직 학습된 항목이 없습니다</p>
        )}
        <ul className={styles.list}>
          {FIELD_ORDER.map((key) => {
            const learned = learnedItemForField(key, learnedItems);
            // M-2 — 학습 항목이 있으면 그 차원 행은 학습된 값으로 대체되어 "학습됨" 태그를 달고,
            // 없으면 기존처럼 자기신고 값을 "자기신고" 태그로 보여준다. 한 차원에 두 값이 동시에
            // 보이는 일은 없다(원본 버그의 핵심 — 원시 patternKey/enum을 별도로 또 보여주던 것).
            const learnedValue = learned ? learnedDisplayValue(learned) : null;
            const learnedRow = learned && learnedValue !== null ? { id: learned.id, learnedValue } : null;
            const isLearned = learnedRow !== null;
            const displayValue = learnedRow
              ? fieldValueLabel(key, learnedRow.learnedValue)
              : fieldValueLabel(key, profile[key]);
            const rowError = learnedRow ? learnedErrors[learnedRow.id] : fieldErrors[key];
            const isThisDeleteTarget = learnedRow
              ? deleteTarget?.type === 'learned' && deleteTarget.id === learnedRow.id
              : deleteTarget?.type === 'field' && deleteTarget.key === key;
            const onRequestDelete = learnedRow
              ? () => requestDeleteLearned(learnedRow.id)
              : () => requestDeleteField(key);
            // MJ-1(리뷰) — 스킵/미시작 사용자는 자기신고 4필드가 항상 null이다
            // (`saveOnboardingProfile`이 `onboardingState !== 'completed'`이면 항상 null로
            // 저장한다, `apps/web/lib/profile/storage.ts:77-80`). 그런데 이 값이 null이어도
            // 수정/삭제 버튼은 계속 렌더됐고, `deleteField`/`saveEdit`는 `onboardingState:
            // 'completed'`를 하드코딩해 보낸다 — "지울 것도 없는" 미설정 행에서 삭제를 누르면
            // 아무것도 안 지워졌는데 온보딩 상태만 completed로 뒤바뀐다(AC-059③⑤가 요구하는
            // skipped/completed 구분이 깨짐). 자기신고 행이면서 값이 없고 아직 completed가
            // 아닌 경우에만 컨트롤을 감춘다 — completed인데 4항목을 전부 지운 M-3 케이스는
            // 그대로 수정/삭제 가능해야 하므로 건드리지 않는다. 값을 채우려면 "온보딩
            // 완료하기" 배너 액션을 쓴다(위 배너 렌더 부분 참고).
            const canManageSelfReport =
              profile.onboardingState === 'completed' || profile[key] !== null;

            return (
              <li key={key} className={styles.item}>
                <div className={styles.itemHeader}>
                  <span className={styles.itemLabel}>{FIELD_LABELS[key]}</span>
                  <span className={styles.tag}>{isLearned ? '학습됨' : '자기신고'}</span>
                </div>

                {editingField !== key && (
                  <>
                    <span className={styles.itemValue}>{displayValue}</span>
                    {(isLearned || canManageSelfReport) && (
                      <div className={styles.itemActions}>
                        {/* 학습된 값이 표시 중인 행은 View + Delete만 지원한다(수정 없음) —
                            파일 헤더 주석 참고. */}
                        {!isLearned && canManageSelfReport && (
                          <button
                            type="button"
                            className={styles.editButton}
                            onClick={() => startEdit(key)}
                          >
                            수정
                          </button>
                        )}
                        <button type="button" className={styles.deleteButton} onClick={onRequestDelete}>
                          삭제
                        </button>
                      </div>
                    )}
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

                {rowError && (
                  <p role="alert" className={styles.errorText}>
                    {rowError}
                  </p>
                )}

                {isThisDeleteTarget && (
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
