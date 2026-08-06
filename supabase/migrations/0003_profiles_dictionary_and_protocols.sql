-- 0003_profiles_dictionary_and_protocols.sql
--
-- T18 [BE-B] M2 Supabase 스키마 구축(프로필 / diff 히스토리 / 용어사전) — Database.md가 요구하는
-- 나머지 사용자 소유 테이블 6개를 추가한다: profiles, profile_learned_items, dictionary_terms,
-- pair_protocols, recipient_enrichments, observation_samples.
--
-- 🔴 sent_messages·diff_records는 여기서 만들지 않는다 — T14가 0002_sent_messages_and_diff_records.sql
-- 로 이미 만들었다(RLS 정책 포함, docs/Tasks.md T18 행 각주). llm_cache·llm_call_log도 T4가
-- 0001_llm_cache_and_log.sql 로 이미 만들었다. Database.md "마이그레이션 순서 (T18)" 절이 전제하는
-- 단일 0001_init.sql 은 실제 리포에 존재하지 않으며(같은 문서 상단 드리프트 각주가 이미 인지),
-- 이 파일은 그 각주가 지시한 대로 남은 테이블만 0003으로 추가한다.
--
-- DDL 출처: docs/Database.md "profiles"(54~67줄) · "profile_learned_items"(71~82줄) ·
-- "dictionary_terms"(115~130줄) · "pair_protocols"(134~178줄) · "recipient_enrichments"(208~239줄) ·
-- "observation_samples"(243~257줄) 절 그대로. 임의 컬럼을 추가하지 않았다.
--
-- 공통 규칙(id uuid default gen_random_uuid(), created_at timestamptz default now())의 테이블별
-- 적용 여부 — 0001·0002 선례("오버라이드 문구가 없으면 공통 규칙을 유지한다")를 그대로 따른다:
--   - profiles: Schema 절이 user_id를 PK로 명시(사용자당 1행) → id 컬럼은 만들지 않는다
--     (llm_cache가 cache_key를 PK로 쓰며 id를 생략한 선례와 동일 판단). created_at은 오버라이드
--     문구가 없으므로 포함한다(updated_at과 별개로 "행 생성 시각"의 의미가 있다 — 감사 추적용).
--   - profile_learned_items / dictionary_terms / recipient_enrichments: id·created_at 둘 다 포함
--     (Schema 절이 이미 id를 PK로 명시).
--   - pair_protocols: id를 PK로 명시. updated_at이 있지만 created_at을 만들지 말라는 문구가 없어
--     0002의 sent_messages(sent_at + created_at 공존) 선례와 동일하게 created_at도 포함한다.
--   - observation_samples: id를 PK로 명시. collected_at이 있지만 같은 이유로 created_at도 포함한다.

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  onboarding_state text not null check (onboarding_state in ('not_started', 'skipped', 'completed')) default 'not_started',
  -- 🔴 AC-059③ — not_started와 skipped를 구분해야 UX-004/016/009가 "개인화 미적용" 표시를 정확히 렌더한다.
  directness text null check (directness in ('direct', 'indirect')),
  emoji_preference text null check (emoji_preference in ('likes', 'neutral', 'avoids')),
  formality text null check (formality in ('high', 'medium', 'low')),
  honorific_level text null check (honorific_level in ('hapsyo', 'haeyo')),
  -- 🔴 스킵 시 위 4개 스타일 컬럼은 전부 NULL로 남는다 — 기본값·추측값을 채우지 않는다(AC-059②).
  -- 애플리케이션(T19)이 강제하며, 이 마이그레이션은 CHECK 제약으로 값의 형태만 제한한다.
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy profiles_owner on profiles
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists profile_learned_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern_key text not null,
  value text not null,
  observed_count int not null check (observed_count >= 3),
  -- 🔴 AC-013 — 3 미만인 행은 존재할 수 없다(스키마 제약으로 굳힌 것). 애플리케이션(T20)이
  -- 3회 미만에서는 이 테이블에 INSERT/UPDATE 자체를 시도하지 않아야 한다.
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, pattern_key)
);

alter table profile_learned_items enable row level security;
create policy profile_learned_items_owner on profile_learned_items
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists dictionary_terms (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('term', 'person')),
  source_text text not null,
  target_text text null,
  ko_honorific text null,
  en_honorific text null,
  -- 🔴 AC-047②③ — en_honorific이 NULL이면 애플리케이션(T22)이 "Manager Kim" 류 추측 생성을 하지 않는다.
  note text null,
  created_at timestamptz not null default now(),
  unique (owner_user_id, entry_type, source_text)
);

create index if not exists dictionary_terms_owner_entry_type_idx
  on dictionary_terms (owner_user_id, entry_type);

alter table dictionary_terms enable row level security;
create policy dictionary_terms_owner on dictionary_terms
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create table if not exists pair_protocols (
  id uuid primary key default gen_random_uuid(),
  pair_key text not null unique,
  party_a text not null,
  party_b text not null,
  directness_allowed text null check (directness_allowed in ('yes', 'no')),
  emoji_policy text null check (emoji_policy in ('ok', 'avoid')),
  address_form text null,
  deadline_style text null,
  -- 🔴 축을 5개로 늘리지 않는다(Database.md — 컬럼 추가는 리뷰에서 반려 대상).
  authorship_state text not null
    check (authorship_state in ('untouched', 'inference_draft', 'sender_confirmed', 'counterpart_authored'))
    default 'untouched',
  last_written_by uuid null references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table pair_protocols enable row level security;
-- 🔴 party_a/party_b는 이메일 문자열이며 auth.users FK가 아니다(상대가 미가입일 수 있음 — AC-065①).
-- 접근 제어는 세션의 이메일 클레임과 두 필드를 대조한다.
create policy pair_protocols_parties on pair_protocols
  using (auth.jwt() ->> 'email' in (party_a, party_b))
  with check (auth.jwt() ->> 'email' in (party_a, party_b));

create table if not exists recipient_enrichments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_identifier text not null,
  source_url text null,
  location text null,
  company text null,
  activity_hour_histogram jsonb null,
  activity_sample_count int null,
  activity_timezone_confirmed text null,
  fetched_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (owner_user_id, recipient_identifier)
);

alter table recipient_enrichments enable row level security;
create policy recipient_enrichments_owner on recipient_enrichments
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create table if not exists observation_samples (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  counterpart_identifier text not null,
  source text not null check (source in ('manual', 'github')),
  indicator_deltas jsonb not null,
  -- 🔴 G1 — 원문 텍스트 컬럼(raw_text/excerpt/quote 등)을 만들지 않는다(AC-081②③).
  -- 집계값만 저장한다: { sentenceCount, emojiCount, charCount, hedgeCount, addressFormKind, deadlineMentionKind }.
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists observation_samples_owner_counterpart_source_idx
  on observation_samples (owner_user_id, counterpart_identifier, source);

alter table observation_samples enable row level security;
create policy observation_samples_owner on observation_samples
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
