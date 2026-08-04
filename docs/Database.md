# Database — 크로스보더 협업 중재 서비스

Owner: architect (see AGENTS.md). Others read-only.
Created only when the project requires a database (architect: "if required").
Based on PRD Version: v3.2 · Based on UX Version: 6.0

> ✅ **엔진·호스팅은 2026-08-04 사용자 결정으로 승인되었다**(`docs/Architecture.md` 상단 게이트 표 · `docs/DECISIONS.md` #31). **`supabase/migrations/0001_init.sql` 작성·적용 보류 조항은 해제되었다** — T18 착수 가능. 단 T45(인증)가 T18보다 **먼저** 완료돼야 한다(Planning Decision #43).

## Engine

**PostgreSQL 15+ (관계형)** — 호스팅은 **Supabase 관리형(Free)**. 엔진과 호스팅은 별개 결정이며 각각 `docs/DECISIONS.md` #3·#4 에 있다.

관계형을 택한 이유(요약): ① 스키마가 실제 관계형이다 ② **AC-039(다른 사용자 데이터 미조회)를 RLS로 DB 레벨에서 강제**할 수 있다 — 애플리케이션 `where` 절에 맡기면 빠뜨린 한 곳이 곧 유출이다 ③ AC-013의 "동일 패턴 3회" 판정이 `GROUP BY … HAVING count(*) >= 3` 한 줄이다.

---

## 이 스키마가 지켜야 하는 금지 사항 (다른 모든 설계 의도보다 우선)

grep으로 검증 가능해야 한다. reviewer의 최우선 확인 항목이다.

| # | 금지 | 근거 |
|---|---|---|
| G1 | `observation_samples` 에 **원문 텍스트 컬럼을 만들지 않는다** | AC-081② — 집계값만 저장, 원문 미저장 |
| G2 | `sent_messages` 에 **감정 분류 컬럼을 만들지 않는다**(`sentiment`, `emotion` 등) | AC-070② — 감정 분류 저장 필드가 **부재**함이 검증 대상 |
| G3 | 이모지 판정 데이터에 **`country`/`region`/`nationality` 컬럼을 만들지 않는다** (그 데이터는 애초에 DB가 아니라 `packages/core/src/data/emoji-risk.ts` 정적 데이터다) | AC-056①, Planning Decision #6/#71 |
| G4 | diff 3회 카운팅 쿼리에 **`recipient` 축을 넣지 않는다** | Planning Decision #35 — 사용자 단위(전체 발송 기준). #58/#70/#75가 모두 이 결정을 불변으로 확인 |
| G5 | 프라이버시 고지의 **동의 여부·철회 이력을 저장하는 테이블을 만들지 않는다** | Planning Decision #81/#102 — 저장하는 것은 **확장 로컬의 표시 버전 번호뿐**이며 T58에 T18 의존을 만들지 않는다 |
| G6 | 추론 초안(UX-018 Stage 2·3 산출물)을 **확정 전에 저장하지 않는다** | AC-074② — 확정 전 저장소에 규약·추론 레코드가 **생성되지 않음**이 조회로 검증된다. 따라서 추론 초안 테이블이 존재하지 않는다 |
| G7 | 추론 확정값을 **별도 테이블에 쓰지 않는다** — `pair_protocols` 와 같은 행에 쓴다 | AC-074①, UX-011 Business Rules("architect must not create a second/parallel table") |
| G8 | 어떤 테이블에도 **비밀번호·API 키·토큰을 저장하지 않는다** | CLAUDE.md. 비밀번호는 `auth.users`(Supabase 관리), 키는 환경변수 |

---

## Schema

전 테이블 `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`. 아래 표에서는 반복을 생략한다.
UX Traceability(어느 화면이 이 테이블을 쓰는지)는 각 테이블 제목 옆에 표기했다.

### `auth.users` (Supabase Auth 관리 — 우리가 만들지 않는다)
UX-001, UX-002 / AC-039, AC-060

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK | 모든 소유 테이블의 `owner_user_id` 가 참조 |
| email | text | UNIQUE | 계정 식별자. **한 이메일당 계정 1개**(UX-002 Business Rules) |
| encrypted_password | — | — | Supabase 관리. 우리 코드가 읽지 않는다. **최소 8자 정책은 Supabase Auth 설정에서 지정**하며 앱에 중복 검증을 만들지 않는다(Planning Decision #86) |

---

### `profiles` — C3 자기신고 전역 프로필
UX-003, UX-009, UX-004(읽기) / AC-011, AC-014, AC-046②, AC-059

| Column | Type | Constraints | Description |
|---|---|---|---|
| user_id | uuid | **PK**, FK → `auth.users(id)` ON DELETE CASCADE | 사용자당 정확히 1행(UX-003 Business Rules) |
| onboarding_state | text | NOT NULL, CHECK IN (`not_started`,`skipped`,`completed`), default `not_started` | 🔴 **AC-059③의 핵심.** `skipped` 와 `not_started` 를 구분할 수 있어야 UX-004/016/009가 "개인화 미적용" 표시를 정확히 렌더한다 |
| directness | text | NULL, CHECK IN (`direct`,`indirect`) | 직설/완곡 |
| emoji_preference | text | NULL, CHECK IN (`likes`,`neutral`,`avoids`) | AC-056②의 경고 억제 판정 입력 |
| formality | text | NULL, CHECK IN (`high`,`medium`,`low`) | 격식도 |
| honorific_level | text | NULL, CHECK IN (`hapsyo`,`haeyo`) | 합쇼체/해요체 (AC-046②) |
| updated_at | timestamptz | NOT NULL default now() | |

🔴 **스킵 시 스타일 컬럼 4개는 전부 `NULL` 로 남는다 — 기본값·추측값을 넣지 않는다**(AC-059②). `not_started` 와 `skipped` 를 같은 값으로 합치는 최적화는 금지다.

---

### `profile_learned_items` — diff 3회 학습으로 반영된 항목
UX-009 / AC-013, AC-014

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | |
| pattern_key | text | NOT NULL | 수정 패턴 식별자(예: `cushion_insert`, `emoji_removed`). `diff_records.pattern_key` 와 **같은 어휘**를 쓴다 |
| value | text | NOT NULL | 프로필에 반영된 값 |
| observed_count | int | NOT NULL, CHECK ≥ 3 | 🔴 **3 미만인 행은 존재할 수 없다** — AC-013의 "3회 미만이면 프로필이 변경되지 않는다"를 스키마 제약으로 굳힌 것 |
| applied_at | timestamptz | NOT NULL default now() | |
| | | UNIQUE(user_id, pattern_key) | 같은 패턴이 두 행이 되지 않는다 |

---

### `diff_records` — AI 제안문 vs 사용자 최종 발송문
UX-004(쓰기), UX-015(리마인드 승인 시 쓰기), UX-009(읽기) / AC-012, AC-013

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | |
| message_id | uuid | NULL, FK → `sent_messages(id)` ON DELETE SET NULL | 확장 클립보드 경로에서는 발송 기록이 없을 수 있어 nullable |
| ai_text | text | NOT NULL | AI 제안문 |
| final_text | text | NOT NULL | 사용자 최종문 |
| pattern_key | text | NULL | 수정 패턴 분류 결과. 분류 불가면 `NULL`(지어내지 않는다) |
| recipient_identifier | text | NULL | 🔴 **서술용일 뿐이며 카운팅에 쓰지 않는다** — 아래 G4 쿼리 참조 |
| channel | text | NOT NULL, CHECK IN (`web`,`extension`) | |

#### 🔴 G4 — "동일 패턴 3회" 판정 쿼리 (이 형태를 바꾸지 않는다)

```sql
-- Planning Decision #35: 사용자 단위(전체 발송 기준). recipient 축이 없다.
SELECT pattern_key, count(*) AS observed_count
FROM diff_records
WHERE user_id = auth.uid() AND pattern_key IS NOT NULL
GROUP BY pattern_key                 -- 🔴 recipient_identifier 를 여기에 넣지 않는다
HAVING count(*) >= 3;
```

`GROUP BY pattern_key, recipient_identifier` 로 바꾸는 변경은 **리뷰에서 반려한다** — Planning Decision #35/#58/#70/#75가 네 번에 걸쳐 불변으로 확인한 사항이며, 수신자별로 나누면 MVP 데이터량에서 3회에 도달하지 못해 학습 기능 자체가 시연되지 않는다(OQ#9 결정 근거).

---

### `dictionary_terms` — C5 용어사전 (용어 + 사람 호칭)
UX-010, UX-004(읽기) / AC-015, AC-016, AC-047

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK | |
| owner_user_id | uuid | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | |
| entry_type | text | NOT NULL, CHECK IN (`term`,`person`) | UX-010의 두 엔트리 타입 |
| source_text | text | NOT NULL | `term`: 원문 용어 / `person`: 실명 |
| target_text | text | NULL | `term`: 유지할 표기(원문 유지가 기본이면 NULL) |
| ko_honorific | text | NULL | `person` 전용 — 한국어 호칭 |
| en_honorific | text | NULL | `person` 전용 — 영어 호칭. **NULL이면 추측 생성 금지**(AC-047②③: "Manager Kim" 자동 생성 금지) |
| note | text | NULL | |
| | | UNIQUE(owner_user_id, entry_type, source_text) | |

**스코프 판정**: UX-010은 "project-level … whether project maps to a team/workspace is an architect decision"이라고 남겼다. **MVP는 사용자 스코프로 확정한다.** 이유: ① PRD 어디에도 팀/워크스페이스 개념이 없고 만들면 PRD에 없는 기능을 추가하는 것이 된다 ② AC-016은 "사용자가 추가·수정·삭제"만 요구한다 ③ 팀 스코프는 초대·권한이라는 별개 기능을 끌고 온다. 미사용 `workspace_id` 컬럼을 미리 만들지도 않는다(YAGNI). 팀 스코프는 post-MVP의 additive 마이그레이션 1건이다.

---

### `pair_protocols` — #24 쌍방 커뮤니케이션 규약
UX-011, UX-018(Stage 4 확정 쓰기), UX-004(읽기) / AC-037, AC-074, AC-075, AC-078

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK | |
| pair_key | text | **UNIQUE**, NOT NULL | 🔴 **한 쌍당 정확히 1행.** 값 = 두 식별자를 소문자화 후 정렬해 `` 로 연결. 양측 누구에게서 조회해도 같은 행에 도달한다 |
| party_a | text | NOT NULL | 정렬 후 앞. 이메일 문자열(상대는 미가입일 수 있으므로 FK 아님 — AC-065①) |
| party_b | text | NOT NULL | 정렬 후 뒤 |
| directness_allowed | text | NULL, CHECK IN (`yes`,`no`) | 규약 4축 ①(AC-037) |
| emoji_policy | text | NULL, CHECK IN (`ok`,`avoid`) | 규약 4축 ② — AC-056②·AC-083의 대조 축 |
| address_form | text | NULL | 규약 4축 ③ 호칭 |
| deadline_style | text | NULL | 규약 4축 ④ 마감 표현 |
| authorship_state | text | NOT NULL, CHECK IN (`untouched`,`inference_draft`,`sender_confirmed`,`counterpart_authored`), default `untouched` | 🔴 AC-075의 4상태 ⓓⓐⓑⓒ |
| last_written_by | uuid | NULL, FK → `auth.users(id)` | 누가 마지막으로 썼는지(감사용). **판정에는 `authorship_state` 를 읽고 시각을 비교하지 않는다**(AC-075③) |
| updated_at | timestamptz | NOT NULL default now() | |

🔴 **축을 5개로 늘리지 않는다** — AC-073②는 "스키마/UI가 5번째 필드의 존재를 물리적으로 막아야 한다"고 요구한다. 컬럼 추가는 리뷰에서 반려한다.

#### AC-075의 architect 판단 — `inference_draft`(ⓐ)의 위치

AC-075는 *"컬럼명·타입·정규화·이력 보관 여부는 architect 몫"* 이라 명시했고, UX-011 Architect Handoff는 *"ⓐ가 언제 영속 읽기로 관측되는가는 architect의 판단"* 이라는 유일한 잔여 모호성을 지목했다. **판정:**

- **MVP의 쓰기 경로는 `inference_draft` 를 절대 쓰지 않는다.** AC-074②가 확정 전 저장을 금지하므로, 초안은 세션 안에만 존재한다(G6).
- 따라서 레코드는 `untouched` → (Stage 4 확정) → `sender_confirmed` 로 **직접** 전이하고, 상대가 UX-011에서 직접 저장하면 `counterpart_authored` 가 된다.
- **`inference_draft` 는 렌더 가능한 값으로 CHECK 제약에 남겨 둔다.** UX-011이 4상태 전부를 렌더할 수 있어야 한다고 요구하기 때문이며, MVP에서 이 값이 저장된 행은 0건이다.
- **이력 테이블을 만들지 않는다** — AC-075는 "마지막으로 수정한 주체"만 요구하고, 이력은 요구하지 않는다.

#### AC-074④ 경합 방어 — 조건부 UPDATE (이 형태를 유지한다)

```sql
-- UX-018 Stage 4 확정. 사전 검사가 아니라 원자적 방어다.
UPDATE pair_protocols
SET directness_allowed = $2, emoji_policy = $3, address_form = $4, deadline_style = $5,
    authorship_state = 'sender_confirmed', last_written_by = auth.uid(), updated_at = now()
WHERE pair_key = $1
  AND authorship_state <> 'counterpart_authored';   -- 🔴 상대가 직접 쓴 규약을 덮지 않는다
-- 영향 행이 0이면 → CONFLICT_PROTOCOL_AUTHORED 로 응답, 초안 폐기, 상대 값 표시
```

Stage 3 진입 시의 사전 검사만으로는 Stage 3~4 사이의 경합을 막지 못한다. UX-018이 요구한 "race-condition guard, not merely a pre-check"의 구현이 이 `WHERE` 절이다.

---

### `sent_messages` — 모의 전송 기록 (#29 침묵 감지 · R4 응답 시간 공용)
UX-004(쓰기), UX-015, UX-013, UX-006 / AC-010, AC-024, AC-025, AC-044, AC-070

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | |
| recipient_identifier | text | NOT NULL | 자유 텍스트 이메일(UX Decision Log: 디렉터리 없음) |
| recipient_country | text | NULL, CHECK IN (`KR`,`US`,`JP`,`CN`) 또는 NULL | 🔴 AC-057의 4개국. **데이터 없는 국가는 `NULL`** 이며 화면에 아무 라벨도 렌더하지 않는다(AC-063①). "휴일 데이터 없음"은 **내부 상태(=NULL)** 로만 존재한다(AC-063②) |
| recipient_timezone | text | NULL | IANA 문자열. 사용자 확정 전에는 NULL(AC-065④) |
| original_text | text | NOT NULL | |
| final_text | text | NOT NULL | 승인된 발송문 |
| urgency | text | NOT NULL, CHECK IN (`CRITICAL`,`NORMAL`,`LOW`) | |
| channel | text | NOT NULL, CHECK IN (`web_mock`,`extension_insert`,`extension_clipboard`) | Planning Decision #37/#63의 3경로 |
| sent_at | timestamptz | NOT NULL default now() | |
| scheduled_for | timestamptz | NULL | R3 예약(AC-024). 🔴 **CRITICAL 이면 항상 NULL**(AC-005) — 애플리케이션에서 강제 |
| replied | boolean | NOT NULL default false | AC-044① **수동 마킹만.** 자동 감지 경로 부재(AC-044⑤) |
| replied_marked_at | timestamptz | NULL | 응답 소요 시간 = `replied_marked_at - sent_at`(AC-025/AC-070①) |
| is_reminder | boolean | NOT NULL default false | AC-044③ C2로 생성된 리마인드 |
| parent_message_id | uuid | NULL, FK → `sent_messages(id)` | 리마인드의 원 발송 건 |
| mediation_applied | boolean | NOT NULL default true | AC-070①의 "중재 전/후 응답 시간 비교"의 축 |

🔴 **G2 — 이 테이블에 `sentiment`/`emotion`/감정 분포 컬럼을 만들지 않는다.** AC-070②는 "감정 분류 함수·프롬프트·LLM 호출·저장 필드가 모두 부재함을 코드 검색으로 확인"을 요구한다. 컬럼 하나가 그 판정을 깨뜨린다.

---

### `recipient_enrichments` — #34 수신자 공개 정보 보강 (P2)
UX-018, UX-004(링크 표시 판정 읽기), UX-005/006/012(타임존 읽기) / AC-065, AC-071, AC-078

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK | |
| owner_user_id | uuid | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | 🔴 **보강 결과는 발신자 본인 화면에만** 표시된다(AC-074③와 같은 원칙) |
| recipient_identifier | text | NOT NULL | |
| source_url | text | NULL | 🔴 **사용자가 직접 붙여넣은 URL 1건.** 검색·크롤링 결과가 여기에 들어오는 코드 경로가 존재하지 않는다(AC-065②) |
| location | text | NULL | 원문 문자열 그대로. 못 얻으면 NULL = "미등록"(AC-065⑤) |
| company | text | NULL | 동일 |
| activity_hour_histogram | jsonb | NULL | 🔴 **시간대별 활동 건수 집계만**(24 버킷). 커밋 메시지·이슈 본문 등 **원본 콘텐츠는 읽지도 저장하지도 않는다**(AC-071④) |
| activity_sample_count | int | NULL | AC-072③ — 어떤 지표가 몇 건에서 나왔는지 |
| activity_timezone_confirmed | text | NULL | 🔴 **사용자가 확정해야 채워진다.** 자동 확정 금지(AC-065④/AC-071③) |
| fetched_at | timestamptz | NULL | AC-065⑥ — 출처와 조회 시각을 화면에 표시 |
| | | UNIQUE(owner_user_id, recipient_identifier) | |

**저장 대상은 정확히 3항목**(`location`, `company`, 활동 시간대)이며 그 외 GitHub 프로필 필드는 **파싱 단계에서 버린다**(AC-065③). 컬럼 추가는 리뷰에서 반려한다.

#### AC-078 — "상대방 정보 보강" 링크 표시 판정 (boolean 1개)

```sql
-- 표시 조건: 이 상대에 대해 개인화에 쓸 정보가 하나도 없을 때만.
-- 🔴 회원 여부로 판정하지 않는다 (온보딩 스킵 회원이 존재하므로 — Planning Decision #104)
SELECT NOT (
  EXISTS (SELECT 1 FROM pair_protocols WHERE pair_key = $pairKey)
  OR EXISTS (SELECT 1 FROM recipient_enrichments
             WHERE owner_user_id = auth.uid() AND recipient_identifier = $recipient
               AND (location IS NOT NULL OR company IS NOT NULL
                    OR activity_timezone_confirmed IS NOT NULL))
) AS show_enrichment_link;
```

---

### `observation_samples` — 관측 표본 (P2, 수동 표시 + GitHub 합산)
UX-016(Mark 모드 쓰기), UX-019, UX-018(읽기) / AC-080, AC-081, AC-082, AC-083

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK | |
| owner_user_id | uuid | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE | |
| counterpart_identifier | text | NOT NULL | 🔴 **사람이 입력한 값.** DOM 발신자 추론 경로가 존재하지 않는다(AC-080②) |
| source | text | NOT NULL, CHECK IN (`manual`,`github`) | AC-080⑤ — 표본마다 출처 기록, 화면에 구분 표시 |
| indicator_deltas | jsonb | NOT NULL | 🔴 **집계값만**: `{ sentenceCount, emojiCount, charCount, hedgeCount, addressFormKind, deadlineMentionKind }`. `packages/core/src/observation/indicators.ts` 가 **경로와 무관하게 같은 정의로** 산출한다(AC-080④) |
| collected_at | timestamptz | NOT NULL default now() | |

🔴 **G1 — 원문 텍스트 컬럼(`raw_text`, `excerpt`, `quote` 등)을 만들지 않는다.** AC-081②③는 원문 미저장·서버 미전송·화면 인용 금지를 동시에 요구하며, 컬럼이 존재하는 순간 세 가지가 함께 무너진다. UX-019가 표시할 수 있는 것은 **건수·출처·수집 시각·지표 기여도**뿐이다(T72).

**삭제 시 재계산**: UX-019에서 표본 1건을 삭제하면 해당 상대의 지표를 **남은 행에서 다시 집계**한다(누적 카운터를 감산하지 않는다 — 감산은 부동소수·순서 문제로 어긋난다). 지표는 어디에도 캐시하지 않고 조회 시점에 집계한다. 표본 규모(상대당 수십 건)에서 비용이 무의미하다.

**임계값 4개는 DB가 아니라 `packages/core/src/constants.ts` 에 산다**(AC-077①/AC-082①: "각 상수는 코드 1곳에 격리"). GitHub 경로 잠정 30(**미검증**), **수동 경로는 미정 — T71에서 실측해 확정**하며 30을 그대로 쓰지 않는다(AC-082③).

---

### `llm_cache` — 응답 캐시 (AC-041)
서버 전용 · 화면 없음

| Column | Type | Constraints | Description |
|---|---|---|---|
| cache_key | text | **PK** | `sha256(model ∥ prompt_version ∥ step ∥ canonicalJSON(정규화 입력))`. 🔴 **user_id 를 키에 넣지 않는다** — 근거는 Architecture.md "LLM 호출 3단 해석" |
| step | text | NOT NULL, CHECK IN (`c1`,`c2`,`c4`,`c6`,`c7`,`suggest`) | |
| model | text | NOT NULL | |
| prompt_version | text | NOT NULL | 프롬프트를 고치면 이 값을 올린다 — 안 올리면 옛 응답이 반환된다 |
| response | jsonb | NOT NULL | |
| hit_count | int | NOT NULL default 0 | 발표 시 "캐시 덕분에 호출 0건"의 증거 |

🔴 **RLS 활성 + 정책 0개** = `anon`/`authenticated` 는 접근 불가. 서버가 `SUPABASE_SERVICE_ROLE_KEY` 로만 읽고 쓴다.
⚠️ **응답 본문(`response`)에는 사용자가 입력한 원문이 부분적으로 포함될 수 있다**(변환문·역번역문). 이것은 `sent_messages` 가 이미 같은 내용을 보유하는 것과 같은 등급이며 새 노출을 만들지 않는다. 다만 **관측 표본 원문은 여기에도 들어가지 않는다**(Mark 모드는 LLM을 호출하지 않는다 — UX-016 External Dependencies).

---

### `llm_call_log` — 호출 기록 (요청 상한 + 관측성)
서버 전용 · 화면 없음

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | NULL, FK → `auth.users(id)` ON DELETE SET NULL | |
| step | text | NOT NULL | |
| model | text | NOT NULL | |
| outcome | text | NOT NULL, CHECK IN (`live`,`cache`,`fallback`,`error`) | 🔴 폴백 비율 지표의 유일한 출처 |
| latency_ms | int | NOT NULL | NFR "체감 5초"의 유일한 수치 근거 |
| input_chars | int | NOT NULL | 🔴 **길이 숫자만.** 내용 컬럼이 없다 |
| error_code | text | NULL | |

🔴 **내용 컬럼(prompt/response/text)을 만들지 않는다** — Architecture.md Observability의 "원문을 로그에 넣지 않는다"가 테이블에서도 성립해야 한다. RLS는 `llm_cache` 와 동일(서비스 롤 전용).

**요청 상한 판정**(AC-041):
```sql
-- ① 사용자·일 단위
SELECT count(*) FROM llm_call_log
 WHERE user_id = $1 AND outcome IN ('live') AND created_at > now() - interval '1 day';
-- ② 전역·일 단위
SELECT count(*) FROM llm_call_log
 WHERE outcome = 'live' AND created_at > now() - interval '1 day';
-- 둘 중 하나라도 상한 초과 → QUOTA_EXCEEDED → 폴백 경로
```
`cache`/`fallback` 은 상한을 소비하지 않는다(실제 크레딧을 쓰지 않으므로).

---

### 만들지 않는 테이블 (의도적 부재 — 이유와 함께 기록한다)

| 만들지 않는 것 | 이유 |
|---|---|
| `privacy_notice_consents` / `notice_views` | G5 — Planning Decision #81/#102. 저장하는 것은 **확장 로컬(`chrome.storage.local`)의 고지 버전 번호뿐**이며, 동의 여부·철회 이력이 아니다. 테이블을 만들면 T58에 T18 의존이 생겨 Planning Decision #102가 명시적으로 막은 결과가 된다 |
| `inference_drafts` / `style_suggestions` | G6 — AC-074②. 추론 초안은 세션 안에만 존재하고 확정분만 `pair_protocols` 에 들어간다. 초안 테이블이 있으면 "확정 전 미저장"이 조회로 반증된다 |
| `threads` / `thread_messages` | UX-008 Data Operations: "Read only (no persistent thread storage implied by docs/PRD.md)". C7 입력 스레드를 저장하지 않는다 |
| `tickets` | UX-007 Data Operations: 승인 전 영속 쓰기 없음. 티켓을 쓰기로 하면 `sent_messages.final_text` 로 들어간다 |
| `holidays` | AC-048①/Planning Decision #52 — **리포 내 하드코딩, 외부 API 호출 0.** DB에 두면 시드가 배포 단계에 끼어들고 롤백 시 불일치가 생긴다. `packages/core/src/data/holidays-2026.ts` |
| `emoji_risk` | G3 — 정적 3단계 룩업이며 국가 필드가 없다. `packages/core/src/data/emoji-risk.ts` |
| `workspaces` / `teams` | PRD에 없는 기능. 용어사전은 사용자 스코프(위 참조) |
| `payments` / `subscriptions` | Monetization "MVP는 결제 수단을 일절 구현하지 않는다" |

---

## Relationships

```
auth.users (1) ─┬─(1) profiles
                ├─(N) profile_learned_items
                ├─(N) diff_records ──(N:1)── sent_messages
                ├─(N) dictionary_terms
                ├─(N) sent_messages ──(self N:1: parent_message_id, 리마인드)
                ├─(N) recipient_enrichments
                ├─(N) observation_samples
                └─(N) llm_call_log

pair_protocols  ── auth.users 와 FK로 연결되지 않는다 (party_a/party_b 는 이메일 문자열)
                   이유: 상대가 미가입일 수 있다 (AC-065① — 자유 텍스트 이메일만으로 중재 정상 완료)
                   접근 제어는 RLS 정책이 auth.jwt()->>'email' 과 대조해 수행한다

llm_cache       ── 어떤 테이블과도 관계가 없다 (키가 콘텐츠 해시이며 사용자와 무관)
```

**의도적으로 만들지 않은 관계 2개**
- `observation_samples` → `recipient_enrichments`: **FK로 묶지 않는다.** 수동 표시 경로는 GitHub URL 없이도 성립해야 하므로(AC-080①), enrichment 행이 없는 상대에게도 표본이 쌓인다. 두 테이블은 `(owner_user_id, 상대 식별자)` 로 논리적으로만 연결된다.
- `pair_protocols` → `recipient_enrichments`: 추론이 규약을 **만드는 입력**이지 규약의 소유자가 아니다(Planning Decision #96). 확정된 값만 `pair_protocols` 에 들어가고 출처는 `authorship_state` 로 표현된다.

---

## Indexes

| Table | Index | Reason |
|---|---|---|
| `diff_records` | `(user_id, pattern_key) WHERE pattern_key IS NOT NULL` | G4의 3회 판정 쿼리(UX-004 중재마다 실행) |
| `diff_records` | `(user_id, created_at DESC)` | UX-009 히스토리 조회 |
| `sent_messages` | `(user_id, replied, sent_at DESC)` | UX-015 미응답 건 필터 + UX-013 시간 비교. 침묵 감지가 **매 화면 진입마다** 도는 쿼리 |
| `sent_messages` | `(user_id, mediation_applied)` | AC-070① 중재 전/후 응답 시간 비교 |
| `pair_protocols` | UNIQUE `(pair_key)` | 조회의 유일한 진입 경로이자 "한 쌍 1행"의 강제 수단 |
| `dictionary_terms` | `(owner_user_id, entry_type)` | UX-004 중재 시 용어·사람 엔트리를 타입별로 로드 |
| `recipient_enrichments` | UNIQUE `(owner_user_id, recipient_identifier)` | AC-078 링크 표시 판정(UX-004 렌더마다) |
| `observation_samples` | `(owner_user_id, counterpart_identifier, source)` | UX-018 Stage 2 지표 집계 + UX-019 목록. `source` 를 포함하는 이유는 AC-083의 **출처별 축 가용성 판정**이 경로별 개수를 따로 세기 때문 |
| `llm_call_log` | `(created_at DESC)` · `(user_id, created_at DESC)` | 요청 상한 2겹 판정. **LLM 호출 직전마다** 실행되므로 없으면 전 중재가 느려진다 |
| `llm_cache` | PK(`cache_key`) 로 충분 | 조회가 정확 일치 1건뿐 |

**만들지 않는 인덱스**: 텍스트 컬럼 전문검색 인덱스 — 검색 기능이 PRD에 없다.

---

## Row Level Security (RLS)

🔴 **AC-039를 애플리케이션 `where` 절이 아니라 DB에서 강제한다.** 전 테이블 RLS 활성이 마이그레이션 0001의 필수 항목이다.

| Table | Policy |
|---|---|
| `profiles`, `profile_learned_items`, `diff_records`, `dictionary_terms`, `sent_messages`, `recipient_enrichments`, `observation_samples` | `USING (owner_user_id = auth.uid())` / `WITH CHECK (owner_user_id = auth.uid())` — SELECT·INSERT·UPDATE·DELETE 전부. (`profiles` 는 컬럼명이 `user_id`) |
| `pair_protocols` | `USING (auth.jwt()->>'email' IN (party_a, party_b))` — 양측이 같은 행을 열람·수정(AC-037). 상대가 미가입이면 사실상 발신자만 접근 |
| `llm_cache`, `llm_call_log` | **RLS 활성 + 정책 0개** = anon/authenticated 전면 차단. 서버가 서비스 롤로만 접근 |

**검증(T18 완료 조건)**: 계정 2개를 만들어 A의 데이터가 B의 세션에서 **0행**으로 조회됨을 실행 출력으로 기록한다(AC-039의 "계정 2개로 교차 확인"을 그대로 수행).

---

## Migration Policy

| 규칙 | 내용 |
|---|---|
| 단일 출처 | `supabase/migrations/NNNN_<slug>.sql` 파일만. **수동 DDL(대시보드 SQL 편집기 직접 실행) 금지** — 다음 사람의 로컬에 재현되지 않는다 |
| 적용 | `supabase db push`. **머지 후 사람이 1회 실행**하며 CI에서 자동 적용하지 않는다 |
| 방향 | **전진 전용.** down 마이그레이션을 쓰지 않는다(17일 안에 롤백 스크립트를 검증할 시간이 없고, 검증되지 않은 롤백 스크립트는 롤백 수단이 아니다) |
| 🔴 **동결 규칙** | **2026-08-19 00:00 KST 이후 additive-only**: `CREATE TABLE` / `ADD COLUMN`(NULL 허용) / `CREATE INDEX` 만 허용. `DROP` · `RENAME` · `ALTER TYPE` · NOT NULL 추가 **금지**. **이유는 롤백이다** — 컬럼을 지우지 않아야 구버전 코드가 신버전 스키마 위에서 그대로 동작하고, 코드만 되돌려도 시스템이 정합해진다(Architecture.md Deployment의 Rollback 행) |
| 타입 생성 | `supabase gen types typescript` 로 `apps/web/lib/db.types.ts` 생성. **손으로 고치지 않는다** |
| 시드 | 데모 시드(T61·T62)는 마이그레이션이 아니라 별도 스크립트(`scripts/seed-demo.ts`)로 두고 **프로덕션 배포 파이프라인에 넣지 않는다** — 시드가 배포에 끼면 롤백 시 데이터 상태가 갈린다 |

### 마이그레이션 순서 (T18)

```
0001_init.sql
  ├─ profiles / profile_learned_items / diff_records / dictionary_terms
  ├─ pair_protocols / sent_messages
  ├─ recipient_enrichments / observation_samples      (P2지만 스키마는 지금 확정 — T1 Rules와 같은 이유)
  ├─ llm_cache / llm_call_log
  ├─ 전 테이블 RLS ENABLE + 정책
  └─ 인덱스
```

🔴 **P2 테이블(`recipient_enrichments`, `observation_samples`)의 스키마도 0001에 함께 넣는다.** 근거는 `docs/Tasks.md` T1의 판단 기준과 같다 — *"나중에 스키마를 바꾸면 프론트·백엔드 통합 재작업이 생긴다."* 테이블이 있어도 쓰는 코드가 없으면 비용은 0이고, 컷되면 빈 테이블이 남을 뿐이다.
