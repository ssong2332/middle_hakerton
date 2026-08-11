/**
 * `@cross-border/core` 패키지 진입점.
 *
 * 🔴 이 파일은 T2(스캐폴드)가 추가한 **re-export 배럴뿐**이다 — 어떤 로직도 담지 않는다.
 * `apps/web`·`apps/extension` 이 같은 코어를 "같은 인터페이스로" 호출한다는 AC-028의 요구를
 * 패키지 경계 하나로 만족시키려면 npm workspace 패키지가 진입점을 가져야 한다.
 */
export * from './contract';
export * from './limits';
export * from './pipeline';
export * from './llm/client';
export * from './errors';
export * from './rules/decision-authority';
export * from './rules/ticket-gate';
export * from './rules/honorific';
export * from './rules/pattern-detection';
export * from './rules/urgency-routing';
export * from './rules/preservation';
export * from './rules/misread-risk';
export * from './rules/response-source';
export * from './rules/meeting-times';
export * from './rules/holiday-conflict';
export * from './rules/deadline-negotiation';
export * from './rules/scheduled-send';
export * from './rules/feedback-summary';
export * from './rules/business-days';
export * from './rules/github-enrichment';
export * from './rules/timezone-candidates';
export * from './observation/indicators';
export * from './constants';
export * from './data/fallback-responses';
export * from './data/emoji-risk';
export * from './data/holidays-2026';
export * from './steps/c1';
export * from './steps/c2';
export * from './steps/c4';
export * from './steps/c6';
export * from './steps/c7';
export * from './prompts/c1';
export * from './prompts/c2';
export * from './prompts/c4';
export * from './prompts/c6';
export * from './prompts/c7';
