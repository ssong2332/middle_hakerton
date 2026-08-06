-- 0002_sent_messages_and_diff_records.sql
--
-- T14 [FE] M1 승인 후 전송 플로우 — `POST /api/messages`(AC-010/AC-012/AC-032)에 필요한 최소
-- 스키마 조각. 🔴 이 마이그레이션은 T18(M2 전체 스키마 구축, `profiles`·`profile_learned_items`·
-- `dictionary_terms` 등 나머지 사용자 소유 테이블)보다 먼저 적용된다 — T4가 `llm_cache`·
-- `llm_call_log`를 T18보다 먼저 `0001_llm_cache_and_log.sql`로 만든 것과 같은 방식이다
-- (오케스트레이터 판단, `docs/Tasks.md` T14 원문 "T4가 이미 겪은 것과 같은 구조다"). T18이
-- 이어서 나머지 테이블을 `0003_*.sql`로 추가한다(Migration Policy "전진 전용" — 이 파일이
-- 나중에 합쳐지지 않는다).
--
-- ⚠️ 파일만 작성한다 — 실제 Supabase 프로젝트에는 적용하지 않는다(오케스트레이터가 적용 여부를
-- 판단한다, 외부 시스템 변경이라 승인 필요).
--
-- DDL 출처: `docs/Database.md` "sent_messages"(178~200줄) · "diff_records"(82~107줄) ·
-- "Indexes"(346~361줄) 절 그대로. 임의 컬럼을 추가하지 않았다.
--
-- 🔴 **RLS 정책 컬럼명 관련 구현 결정 — docs 불일치를 발견해 더 상세한 절을 따랐다(임의 판단
-- 아님, 근거를 남긴다).** `docs/Database.md` "Row Level Security" 절(367행)은 "profiles,
-- profile_learned_items, diff_records, dictionary_terms, sent_messages, recipient_enrichments,
-- observation_samples: USING (owner_user_id = auth.uid()) ... (profiles는 컬럼명이 user_id)"라고
-- 적어, profiles만 예외로 두고 나머지 전부 `owner_user_id`를 쓰는 것처럼 그룹화한다. 하지만 같은
-- 문서의 **Schema 절**(각 테이블의 Column|Type|Constraints 표, sent_messages 184행·diff_records
-- 88행)과 **Indexes 절**(350~353행, `(user_id, pattern_key)` 등)은 `sent_messages`·`diff_records`
-- **둘 다 컬럼명이 `user_id`**라고 두 곳에서 독립적으로 명시한다(profile_learned_items도 73행에서
-- 마찬가지). 즉 RLS 절의 한 줄 요약이 이 세 테이블을 잘못 그룹화한 것으로 보인다. **Schema 절이
-- 각 테이블의 실제 DDL 출처**이고(0001 마이그레이션 헤더 주석의 선례와 동일한 원칙 — "DDL 출처는
-- Schema 절 그대로"), Indexes 절이 같은 컬럼명을 독립적으로 재확인하므로, 이 마이그레이션은
-- `user_id`를 그대로 쓴다. **이 불일치는 구현 보고서에 남기고 architect에게 docs 동기화를
-- 권고한다** — 여기서 Database.md를 직접 고치지 않는다(architect 소유 문서).
--
-- 전 테이블 공통 규칙(docs/Database.md:36 "id uuid default gen_random_uuid(), created_at
-- timestamptz default now()")을 두 테이블 모두에 적용한다. sent_messages는 Schema 절에 이미
-- `sent_at timestamptz NOT NULL default now()`가 있어 "발송 시각"과 "행 생성 시각"의 의미가
-- 사실상 같지만(모의 전송은 승인 즉시 insert되므로), 공통 규칙을 오버라이드하는 문구가 없어
-- created_at도 함께 둔다(0001 선례와 동일 판단).

create table if not exists sent_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_identifier text not null,
  recipient_country text null check (recipient_country in ('KR', 'US', 'JP', 'CN')),
  recipient_timezone text null,
  original_text text not null,
  final_text text not null,
  urgency text not null check (urgency in ('CRITICAL', 'NORMAL', 'LOW')),
  channel text not null check (channel in ('web_mock', 'extension_insert', 'extension_clipboard')),
  sent_at timestamptz not null default now(),
  -- 🔴 AC-005 — CRITICAL이면 항상 NULL. 애플리케이션(`apps/web/lib/messages/storage.ts`
  -- `insertSentMessage()`)이 강제하며, 이 CHECK는 DB 레벨 방어선을 추가하지 않는다(Database.md가
  -- 이 컬럼에 그런 CHECK를 요구하지 않는다 — 애플리케이션 강제로 명시).
  scheduled_for timestamptz null,
  replied boolean not null default false,
  replied_marked_at timestamptz null,
  is_reminder boolean not null default false,
  parent_message_id uuid null references sent_messages(id),
  -- 🔴 G2 — 이 테이블에 sentiment/emotion 등 감정 분류 컬럼을 만들지 않는다(AC-070②).
  mediation_applied boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists sent_messages_user_replied_sent_at_idx
  on sent_messages (user_id, replied, sent_at desc);
create index if not exists sent_messages_user_mediation_applied_idx
  on sent_messages (user_id, mediation_applied);

alter table sent_messages enable row level security;
create policy sent_messages_owner on sent_messages
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists diff_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid null references sent_messages(id) on delete set null,
  ai_text text not null,
  final_text text not null,
  -- 🔴 분류 불가면 NULL(지어내지 않는다) — 패턴 분류기는 T20 범위, 지금은 항상 NULL로 저장된다
  -- (`apps/web/lib/messages/storage.ts` `insertDiffRecord()` 주석 참조).
  pattern_key text null,
  recipient_identifier text null,
  channel text not null check (channel in ('web', 'extension')),
  created_at timestamptz not null default now()
);

-- 🔴 G4 — 3회 판정 쿼리(`docs/Database.md` diff_records 절)가 쓰는 인덱스. recipient_identifier
-- 축을 넣지 않는다(Planning Decision #35 — 사용자 단위, recipient 축 금지).
create index if not exists diff_records_user_pattern_key_idx
  on diff_records (user_id, pattern_key) where pattern_key is not null;
create index if not exists diff_records_user_created_at_idx
  on diff_records (user_id, created_at desc);

alter table diff_records enable row level security;
create policy diff_records_owner on diff_records
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
