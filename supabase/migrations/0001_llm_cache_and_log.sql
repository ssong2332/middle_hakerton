-- 0001_llm_cache_and_log.sql
--
-- T4 [BE-A] M0 OpenAI 호출 백엔드 프록시 — AC-041(캐싱 + 요청 상한)에 필요한 최소 스키마 조각.
-- 🔴 이 마이그레이션은 T18(M2 전체 스키마, F3)보다 먼저 적용된다 — T4가 기능상 지금 이 두 테이블만
-- 필요하기 때문이다(오케스트레이터 판단). 나머지 테이블(profiles, sent_messages 등)은 T18이 이어서
-- 0002_*.sql 로 추가한다(Migration Policy "전진 전용" — 이 파일이 나중에 합쳐지지 않는다).
--
-- DDL 출처: docs/Database.md "llm_cache"(255~268줄) · "llm_call_log"(272~297줄) 절 그대로.
-- 임의 컬럼을 추가하지 않았다.
--
-- 전 테이블 공통 규칙(docs/Database.md:36 "id uuid default gen_random_uuid(), created_at
-- timestamptz default now()")의 이 두 테이블 적용 여부(implementer 판단, 근거를 남긴다):
--   - llm_cache: PK가 cache_key 이므로 id 컬럼은 만들지 않는다(불필요 — cache_key가 이미 유일 식별자).
--     created_at은 공통 규칙을 오버라이드하는 문구가 Database.md 어디에도 없고, diff_records처럼
--     컬럼 표에 없어도 인덱스 절에만 등장하며 여전히 존재하는 선례가 있다. Indexes 절의
--     "llm_cache | PK(cache_key)로 충분"은 "추가 인덱스가 필요 없다"는 뜻이지 "컬럼이 없다"는
--     뜻이 아니므로, 공통 규칙대로 created_at을 포함한다(캐시 신선도 확인 등 운영 디버깅에도 쓰인다).
--   - llm_call_log: id·created_at 둘 다 포함한다 — Indexes 절이 (created_at DESC) ·
--     (user_id, created_at DESC) 인덱스를 명시적으로 요구하므로 created_at 존재가 확정된다.

create table if not exists llm_cache (
  cache_key text primary key,
  step text not null check (step in ('c1', 'c2', 'c4', 'c6', 'c7', 'suggest')),
  model text not null,
  prompt_version text not null,
  response jsonb not null,
  hit_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table llm_cache enable row level security;
-- 정책 0개 — anon/authenticated 전면 차단. 서버는 SUPABASE_SERVICE_ROLE_KEY로만 접근한다
-- (docs/Database.md "Row Level Security" 절 "llm_cache, llm_call_log: RLS 활성 + 정책 0개").

create table if not exists llm_call_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  step text not null,
  model text not null,
  outcome text not null check (outcome in ('live', 'cache', 'fallback', 'error')),
  latency_ms int not null,
  input_chars int not null,
  error_code text null,
  created_at timestamptz not null default now()
);
-- 🔴 내용 컬럼(prompt/response/text)을 만들지 않는다 — docs/Architecture.md Observability
-- "절대 로그에 넣지 않는 것"이 테이블에서도 성립해야 한다. 길이는 input_chars 숫자로만 남긴다.

alter table llm_call_log enable row level security;
-- 정책 0개 — 위와 동일.

-- docs/Database.md "Indexes" 절 — 요청 상한 2겹 판정이 LLM 호출 직전마다 실행되므로 필수.
create index if not exists llm_call_log_created_at_idx on llm_call_log (created_at desc);
create index if not exists llm_call_log_user_created_at_idx on llm_call_log (user_id, created_at desc);
