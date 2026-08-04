# UX — 크로스보더 협업 중재 서비스 (Cross-Border Collaboration Mediator)

Owner: ux-design (see AGENTS.md). Others read-only.
Update this document in place — do not recreate it from scratch. Preserve existing sections unless explicitly superseded by a newer decision. The **UX Decision Log** is append-only — never rewrite or delete a past entry; append a new one if a decision changes.
Flow IDs and Screen IDs are immutable once assigned — never renumber existing IDs, even if one becomes Deprecated. New flows/screens always get the next available ID.

## Overview
| Item | Value |
|---|---|
| Document Version | 2.0 |
| Based on PRD Version | v2.3 (2026-08-04) |
| Last Updated | 2026-08-04 |

This is a revalidation pass against docs/PRD.md v2.3 (previous pass was against v2.0). docs/PRD.md changed materially between v2.0 and v2.3 (Planning Decisions #44–#60, MVP Scope rows #29–#31, AC-043–AC-051), so every existing flow/screen was re-checked against the new PRD before any new ones were added, per the Workflow. No flow or screen was found unsupported by v2.3 — everything from Document Version 1.0 remains valid and is **extended in place**; nothing moved to Deprecated this round.

**Six ux-design-routed items were resolved this pass** (per planner's explicit routing in docs/Tasks.md T6, T12, T23, T27, T52, T54):
1. Misread Risk (오해 사전 경고) pre-approval display — extended into UX-004 (AC-043), with a degradable two-tier presentation per Planning Decision #57 (see UX Decision Log).
2. Honorific-level (존댓말 레벨) mixing warning — extended into UX-004's backtranslation/warnings area (AC-046), plus a new onboarding/profile question (UX-003, UX-009).
3. "Person (호칭)" dictionary entry type — extended into UX-010 with an entry-type selector and 3 fields (AC-047).
4. Decision Authority Status column — extended into UX-007 (C6 ticket) and UX-008 (C7 decision table) (AC-050), with "불명" shown explicitly, never left blank.
5. Sent Messages list + reply marking + reminder approval — **new Screen UX-015 and new Flow UF-013** (AC-044).
6. Holiday-conflict warning → deadline-renegotiation entry point — extended into UX-004 (warning + link) and UX-005 (Business Rules) (AC-048).

Additionally, the Gmail adapter (AC-051, MVP Scope #31) was absorbed into the existing UX-014 (GitHub/Slack overlay) definition rather than given a new Screen ID — see UX Decision Log for the reasoning — and a new Flow UF-014 was added for it.

This document now covers the web app (Next.js, primary demo path per Planning Decision #3) and the Chrome extension (GitHub + Slack + Gmail adapters, secondary channel). **14 user flows and 15 screens** are defined below, tracing to every MVP-scope acceptance criterion that has a coverable UI.

**Acceptance criteria with no coverable UI** (backend, process, or logistics only — not forced into a screen, per the Consistency Check rule): AC-026 (deployed URL running the full flow — an infrastructure/QA verification, not a distinct screen; its user-visible surface is simply UX-001–UX-004 working end-to-end on the public URL), AC-027 (I/O schema documentation — a developer artifact), AC-028 (core engine/adapter separation — an architecture property, verified by import-path inspection, not a screen), AC-030/AC-031 (backend key handling and `.env.example`/README sync — no UI), AC-032 (fixed processing order — reflected as a Business Rule on UX-004 and verified via logs/tests, not a separate screen), AC-033 (synthetic demo data preparation — a content/QA task, not a screen), AC-034 (presentation materials — not part of the product UI), AC-035 (painpoint interview validation — a research activity, not a product feature), **AC-045 (신규 v2.3 — Korean euphemistic-urgency restoration, KO→EN: a translation-quality/prompt-rule guarantee verified by the T11 regression test set, not a distinct interactive control; its only user-visible surface is the same transformed-text/backtranslation area UX-004 already renders — no new widget), AC-049 (신규 v2.3 — unambiguous date/number formatting: likewise a backend normalization rule verified by regression tests, visible only as ordinary text within UX-004's existing transformed-text display, no separate control)**.

This project has a user-facing UI (two-panel web app + Chrome extension), so ux-design is applicable — this is not a CLI/library/headless-API project.

## User Flows
Every flow must use this template — do not vary the shape.

### Sign Up & Log In (Flow ID: UF-001)
| Item | Value |
|---|---|
| Actor | Any user (new or returning) |
| Trigger | User opens the web app without an active session, or an active session expires |
| Related Acceptance Criteria | AC-039 |
| Steps | 1. User opens the web app. 2. If no valid session exists, the app redirects to Login (UX-001). 3. New user selects "Sign up" → Sign Up (UX-002); enters email + password + confirm password; submits. 4. Returning user enters email + password on Login; submits. 5. On success, a session is created and the user is redirected to the originally requested URL, or to the Two-Panel Mediation Workspace (UX-004) if none was requested. 6. First-time login (no profile record yet) redirects to Onboarding (UX-003, see UF-002) before reaching UX-004. 7. User may log out from the nav menu at any time, ending the session and returning to Login. |
| Alternative Flow | Password reset is not specified in docs/PRD.md — out of scope for this MVP pass (see Open Questions). |
| Failure Flow | Invalid credentials → inline error on Login, fields retained except password. Signup with an email already in use → inline error with a link to Login. |
| Success Criteria | A valid session exists; each user's profile/pair-protocols/diff history/dictionary are scoped to that identity only, verifiable by cross-checking two accounts (AC-039). |

### Onboarding — Communication Style Profile Setup (Flow ID: UF-002)
| Item | Value |
|---|---|
| Actor | Newly registered user, first login only |
| Trigger | First successful login/signup with no existing profile record |
| Related Acceptance Criteria | AC-011, AC-046 |
| Steps | 1. User lands on Onboarding (UX-003) immediately after first login. 2. User answers 3–5 questions (directness vs. indirectness, emoji preference, formality level, and — v2.2/v2.3 addition — honorific level (합쇼체/해요체) for EN→KO output; if adding this would exceed 5 questions, an existing question is merged per T19, an implementation detail this document doesn't dictate). 3. User submits. 4. A profile record is created and immediately used as the personalization baseline for future conversions (C2/C4), including which honorific level EN→KO conversions default to (AC-046②). 5. User is redirected to the Two-Panel Mediation Workspace (UX-004). |
| Alternative Flow | N/A — see Open Questions for whether individual questions may be skipped. |
| Failure Flow | Save fails (network/API) → error shown, answers retained in the form, retry available. |
| Success Criteria | A profile record exists for the user and is retrievable/editable later from UX-009. |

### Compose & Mediate a Message — Web (Flow ID: UF-003)
| Item | Value |
|---|---|
| Actor | Logged-in sender |
| Trigger | User opens the Two-Panel Mediation Workspace (default landing screen) and starts writing a message to a recipient |
| Related Acceptance Criteria | AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-015, AC-022, AC-029, AC-032, AC-041, AC-043, AC-046, AC-047, AC-024 (optional branch), AC-036 (optional branch), AC-048 (optional branch) |
| Steps | 1. User enters a recipient identifier and message text in the Sender panel. 2. User triggers mediation ("Run Mediation"). 3. System runs the fixed pipeline in order: C1 urgency classification → (if CRITICAL, skip scheduling/negotiation) → C3 profile lookup → C5 terminology injection → C2 tone conversion with preservation filter (also producing `misreadRisks[]`, honorific-consistency `warnings[]`, and `holidayConflicts[]` in the same call) → C4 backtranslation. 4. Urgency badge (CRITICAL/NORMAL/LOW) and reasoning appear in the Sender panel; user may override the level. 5. Recipient panel shows the transformed message (preserved items marked), the conversion reason, the backtranslation with its "1차 안전장치" limitation notice, and inline non-blocking warnings where applicable: emoji-culture (R1), honorific-level mixing (AC-046), unregistered-honorific (AC-047). 6. **Before approving**, the user can see any Misread Risk items (`misreadRisks[]` — quote / expected misreading / evidence per item; nothing renders if the array is empty, AC-043) and any holiday-conflict warning (`holidayConflicts[]`; nothing renders if empty) with a "기한 재협상" link into Response Deadline Negotiation (UX-005) when a conflict is flagged. 7. If the message reads as emotionally charged, a "Convert to Task Ticket" link appears (branches to UF-004; optional). 8. If urgency is NORMAL/LOW, the user may optionally open Response Deadline Negotiation (UX-005) or Scheduled Send (UX-006). 9. User reviews and explicitly clicks "Approve & Send." 10. System performs a mock send: the Recipient panel updates to a "Delivered" state with a timestamped log entry, and the approved-vs-AI-suggested diff is recorded. |
| Alternative Flow | User overrides the urgency level (step 4) — the override carries through steps 5–10. User edits the transformed text directly before approving — the edited text becomes the diff baseline (AC-012). CRITICAL messages skip step 8 entirely and go straight to step 9 with tone-only refinement (AC-005). Misread Risk items and holiday-conflict warnings are advisory only and never block "Approve & Send" — the human decides even when warned, consistent with Planning Decision #5. |
| Failure Flow | LLM call times out/fails at any pipeline step → fallback UI (progress indicator → failure banner with retry; draft text preserved, AC-029). If a pre-scripted fallback response is used instead (cache/credit exhaustion), a visible "폴백 응답 사용 중" indicator is shown (AC-041). |
| Success Criteria | A mock-delivered message exists in the Recipient panel with an audit log entry; no send occurs without the explicit approval click in step 8 (AC-010). |

### Convert Emotional Message to Task Ticket (Flow ID: UF-004)
| Item | Value |
|---|---|
| Actor | Logged-in sender, mid-composition |
| Trigger | User clicks "Convert to Task Ticket" from the Recipient panel of UX-004 |
| Related Acceptance Criteria | AC-017, AC-018, AC-050 |
| Steps | 1. User clicks "Convert to Task Ticket." 2. System restructures the message into 4 sections — [문제 정의] / [영향·리스크] / [요청 사항] / [우려 수준] — on the Ticket View (UX-007), plus a **결정 권한 상태** (Decision Authority Status) meta field (확정/내부 승인 필요/검토 중/불명), shown as `불명` with no evidence rather than left blank or guessed (AC-050①). 3. [우려 수준] shows the preserved emotional intensity as metadata (not deleted). 4. User reviews and may edit any section (the authority status field is read-only, since it is not one of the 4 user-editable sections — see this screen's Architect Handoff). 5. User returns to UX-004 with the ticket content as the message body to mediate/approve. |
| Alternative Flow | N/A |
| Failure Flow | Conversion API fails → error banner with retry; the original free-text message is preserved and the user can proceed with normal (non-ticket) mediation instead. |
| Success Criteria | A 4-section structured ticket is visible with concern-level preserved; the user can proceed to approval. |

### Summarize Thread Decisions & Detect Unresolved Items (Flow ID: UF-005)
| Item | Value |
|---|---|
| Actor | Logged-in user |
| Trigger | User enters a multi-message thread and requests a decision summary |
| Related Acceptance Criteria | AC-019, AC-020, AC-038, AC-050 |
| Steps | 1. User navigates to Decision Summary (UX-008) and inputs thread text. 2. User triggers summarization. 3. System returns a Decision / Owner / Deadline / **결정 권한 상태** table (the fourth column added v2.2/v2.3, AC-050). 4. Fields with no evidence in the thread are shown as "미정" (Decision/Owner/Deadline) or "불명" (Decision Authority Status) — never invented. 5. System separately lists Unresolved warnings — agreement-like statements with a missing Owner and/or Deadline, each labeled with which field is missing. |
| Alternative Flow | N/A |
| Failure Flow | Summarization API fails → error banner + retry, input thread text preserved. |
| Success Criteria | Table and warning list are both visible and consistent — no fabricated owners/deadlines. |

### Manage Communication Profile (Flow ID: UF-006)
| Item | Value |
|---|---|
| Actor | Logged-in user |
| Trigger | User navigates to Profile (UX-009) from the nav menu |
| Related Acceptance Criteria | AC-012, AC-013, AC-014, AC-046 |
| Steps | 1. User opens the Profile screen. 2. Screen lists current profile values (from onboarding + learned patterns) with a source indicator (self-reported vs. learned-from-diff), including the honorific-level (합쇼체/해요체) item added v2.2/v2.3 (AC-046②). 3. User may edit or delete any item. 4. Changes save immediately and apply to future conversions. |
| Alternative Flow | N/A |
| Failure Flow | Save fails → inline error, previous values retained, retry available. |
| Success Criteria | Displayed profile matches what is actually used in the next mediation run; deleted items no longer influence output. |

### Manage Project Terminology Dictionary (Flow ID: UF-007)
| Item | Value |
|---|---|
| Actor | Logged-in user |
| Trigger | User navigates to Terminology Dictionary (UX-010) |
| Related Acceptance Criteria | AC-015, AC-016, AC-047 |
| Steps | 1. User opens the dictionary screen and sees the entry list (term → do-not-translate mapping, and — v2.2/v2.3 addition — person/honorific entries). 2. User adds an entry, first choosing an entry type: **용어 (Term)** or **사람/호칭 (Person)**. For a Term entry, user fills the term mapping as before. For a Person entry, user fills 3 fields: 실명 (real name) / 한국어 호칭 (Korean form of address) / 영어 호칭 (English form of address). 3. User may edit or delete any entry of either type. 4. Saved terms/honorifics are used in subsequent C5 injection during mediation (UF-003) — registered honorifics are used exactly as entered in both directions; unregistered people are never auto-assigned a guessed honorific (AC-047②/③). |
| Alternative Flow | N/A |
| Failure Flow | Duplicate term → inline validation error, add blocked until resolved. Save fails → inline error, retry. |
| Success Criteria | A registered term appears unmodified (not paraphrased) in the next mediation output containing that term. |

### Agree on Pair Communication Protocol (Flow ID: UF-008)
| Item | Value |
|---|---|
| Actor | Two logged-in users (sender + a specific recipient) |
| Trigger | Either user opens Pair Protocol (UX-011) for a specific counterpart |
| Related Acceptance Criteria | AC-037 |
| Steps | 1. User selects/enters the counterpart's identifier and opens the pair protocol for that pair. 2. If none exists yet, the user sets values for 4 items: directness allowed / emoji use / form of address / deadline phrasing. 3. The counterpart opens the same screen (their own login) and reviews/edits the same 4 items. 4. Saved values apply as the agreed protocol for messages exchanged with that counterpart, overriding the sender's global C3 profile on conflicting fields. |
| Alternative Flow | N/A |
| Failure Flow | Save fails → inline error, retry, values retained in the form. |
| Success Criteria | A message to that counterpart uses the pair protocol values over the global profile wherever the two conflict (per AC-037's example). |

### Get Meeting Time Suggestions (Flow ID: UF-009)
| Item | Value |
|---|---|
| Actor | Logged-in user |
| Trigger | User opens Meeting Time Suggestion (UX-012) |
| Related Acceptance Criteria | AC-023 |
| Steps | 1. User enters own timezone + available hours, and the counterpart's timezone + available hours. 2. User requests suggestions. 3. System returns up to 3 overlapping candidate times. |
| Alternative Flow | No overlap found → explicit empty state with explanation. |
| Failure Flow | API fails → error + retry, inputs retained. |
| Success Criteria | Up to 3 valid overlapping times are shown, or an explicit no-overlap message. |

### Review Response Feedback (Time & Sentiment) (Flow ID: UF-010)
| Item | Value |
|---|---|
| Actor | Logged-in user |
| Trigger | User opens Response Feedback (UX-013) |
| Related Acceptance Criteria | AC-025 |
| Steps | 1. User opens the feedback screen. 2. Screen lists sent messages with recorded reply arrival time (elapsed) and reply sentiment classification. 3. Screen shows a before/after comparison of pre- vs. post-mediation average response time and sentiment distribution. |
| Alternative Flow | No replies recorded yet → empty state. |
| Failure Flow | Data fails to load → error + retry. |
| Success Criteria | Comparison reflects only messages with an actually-recorded reply — no fabricated data points. |

### Mediate & Insert via Chrome Extension — GitHub (Flow ID: UF-011)
| Item | Value |
|---|---|
| Actor | Logged-in user working inside a GitHub PR/issue comment box |
| Trigger | User clicks the extension-injected "Mediate" control near a GitHub comment input field |
| Related Acceptance Criteria | AC-021, AC-040 |
| Steps | 1. User writes a comment in GitHub's native input field. 2. User clicks the injected "Mediate" button; extension reads the field's current text. 3. Extension Mediation Overlay (UX-014) opens, showing the same classify → convert → backtranslate output as UF-003. 4. User reviews, may override urgency or edit text. 5. User clicks "Insert" — approved text is written into GitHub's comment input field via DOM insertion. 6. Overlay closes; the user must manually click GitHub's own submit control — the extension never does this. |
| Alternative Flow | User cancels the overlay → input field unchanged, original draft preserved. |
| Failure Flow | Extension cannot find/write to the input field (host DOM change) → error with a "copy to clipboard" fallback. LLM failure → same fallback pattern as UF-003. |
| Success Criteria | Approved text appears verbatim in GitHub's input field; no submit/send action was triggered by the extension (AC-040). |

### Mediate & Insert via Chrome Extension — Slack (Flow ID: UF-012)
| Item | Value |
|---|---|
| Actor | Logged-in user working inside a Slack message compose box |
| Trigger | User clicks the extension-injected "Mediate" control near a Slack message input field |
| Related Acceptance Criteria | AC-042, AC-040 |
| Steps | Identical in shape to UF-011 steps 1–6; the target field is Slack's message compose box instead of GitHub's comment box. |
| Alternative Flow | Same as UF-011. |
| Failure Flow | Same as UF-011, targeting Slack's DOM. |
| Success Criteria | Same as UF-011, verified against Slack's own send control never being auto-clicked (AC-040, AC-042). |

### Track Sent Messages, Mark Replies & Approve Reminders (Flow ID: UF-013)
| Item | Value |
|---|---|
| Actor | Logged-in sender |
| Trigger | User opens Sent Messages & Reminder Approval (UX-015) from the nav menu, typically to check on outstanding messages |
| Related Acceptance Criteria | AC-044 |
| Steps | 1. User opens UX-015. 2. Screen lists all of the user's previously mock-sent messages with recipient, sent time, and elapsed business days (weekends + the recipient's country holidays from the AC-048 hardcoded dataset excluded). 3. For each unmarked message past the 2-business-day threshold (Planning Decision #60), a reminder-suggestion badge appears on that row. 4. User marks "답장 받음" on any message that has actually been replied to (outside the tool) — that row's reminder suggestion disappears and the row shows a static replied state. 5. For a message still needing a nudge, user clicks "리마인드 검토," which generates a C2-toned reminder draft (a polite confirmation, never a demand). 6. User reviews, and may edit, the draft. 7. User clicks "Approve & Send" — the reminder is mock-sent (same send semantics as UF-003 step 10) and a log entry + diff record are created. |
| Alternative Flow | User takes no action on a reminder suggestion — it remains visible on next visit until either replied is marked or the reminder is approved (no snooze/dismiss control is designed, since docs/PRD.md doesn't request one). |
| Failure Flow | Reminder-text generation (C2 call) fails → inline error + retry on that row; no auto-send attempted, no reminder text shown. Mark-replied or approve-send network failure → inline error, that row's state reverts, retry available. |
| Success Criteria | A message's replied status accurately reflects only the user's manual marking (AC-044①/⑤); no reminder is ever sent without the explicit approval click in step 7 (AC-010, AC-044④); reminder wording reads as a confirmation, not a demand (verified upstream by T51's 3 test cases). |

### Mediate & Insert via Chrome Extension — Gmail (Flow ID: UF-014)
| Item | Value |
|---|---|
| Actor | Logged-in user composing an email in Gmail's web compose window |
| Trigger | User clicks the extension-injected "Mediate" control near the Gmail compose body field |
| Related Acceptance Criteria | AC-051, AC-040 |
| Steps | Identical in shape to UF-011 steps 1–6; the target field is Gmail's compose body instead of GitHub's comment box, and the recipient is derived from Gmail's "To:" field where readable, or manually entered otherwise (same pattern as UX-014's existing GitHub/Slack context-derivation rule). |
| Alternative Flow | Same as UF-011. |
| Failure Flow | Same as UF-011, targeting Gmail's DOM. Gmail's compose DOM is reputed to be complex/frequently-changing (docs/PRD.md Assumptions, unverified) — the "copy to clipboard" fallback applies identically if DOM insertion fails. |
| Success Criteria | Same as UF-011, verified against Gmail's own Send control never being auto-clicked (AC-040, AC-051). |

## Screen Catalog
Every screen must use this template — do not vary the shape.

### Login Screen (Screen ID: UX-001)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-001 |
| Acceptance Criteria | AC-039 |
| Purpose | Authenticate a returning user. |
| User Goal | Get into the tool quickly with my own account. |
| Entry | Direct URL to any protected route while unauthenticated; "Log in" link from Sign Up. |
| Exit | On success → originally requested URL or UX-004 (default). "Sign up" link → UX-002. |
| Primary Actions | Enter email + password; Submit ("Log in"). |
| Secondary Actions | Navigate to Sign Up. |
| States | Loading: submit button shows a spinner and disables to prevent double-submit / Empty: form blank on first load / Error: invalid-credentials banner above the form / Success: brief confirmation, then redirect. |
| Validation | Email required, must match basic email format. Password required. Submit enabled only when both fields are non-empty and email passes format check. Format error shown inline under the email field, clears as soon as the field is edited. Invalid-credentials error (server-side) shown as a form-level banner, clears on next submit attempt or field edit. |
| Failure | Invalid credentials → banner "이메일 또는 비밀번호가 올바르지 않습니다"; user may retry or go to Sign Up. Network/server error → banner with a "다시 시도" retry button, form values retained. |
| Accessibility | Full keyboard operability (Tab order: email → password → submit → sign-up link); Enter submits; labels programmatically associated with inputs; error banner uses `role="alert"`; error conveyed with icon + text + border, not color alone. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical |
| Business Rules | A session must exist before any protected screen loads. Password rules are enforced at signup (UX-002); login only checks existing credentials. |
| Data Required | email, password (input only, never displayed after submit) |
| Data Operations | Read (validate credentials against the stored user record) |
| External Dependencies | Auth provider (implementation choice is architect's per Planning Decision #30, e.g. Supabase Auth) |
| Permissions | None (this screen exists to establish permissions) |
| Navigation Targets | UX-004 (default post-login), UX-003 (if first login / no profile yet), UX-002 (Sign Up), or the originally requested protected URL |
| Events Emitted | `login_succeeded`, `login_failed` |
| Expected Outputs | An authenticated session/token for subsequent screens |
| Assumptions | Network available; auth service reachable |

### Sign Up Screen (Screen ID: UX-002)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-001 |
| Acceptance Criteria | AC-039 |
| Purpose | Create a new account. |
| User Goal | Get my own account so my data is private to me. |
| Entry | "Sign up" link from UX-001; direct URL /signup. |
| Exit | On success → UX-003 (onboarding, since no profile exists yet). |
| Primary Actions | Enter email, password, confirm password; Submit ("Sign up"). |
| Secondary Actions | Navigate to Login. |
| States | Loading / Empty / Error / Success — same pattern as UX-001. |
| Validation | Email required + format check. Password required, minimum length per architect's policy (see Open Questions — PRD does not specify one). Confirm password must match Password (mismatch shown inline under the confirm field, clears on edit). Duplicate email → server-side banner "이미 가입된 이메일입니다" with a Login link. Submit enabled only when all three fields pass client-side checks. |
| Failure | Duplicate email → banner + Login link. Network/server error → retry banner; email retained, password fields cleared for security. |
| Accessibility | Same keyboard/labels/alert pattern as UX-001; password fields have a visible show/hide toggle with an accessible label. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical |
| Business Rules | Password policy TBD by architect (Open Question). One account per email. |
| Data Required | email, password |
| Data Operations | Create (user record) |
| External Dependencies | Auth provider |
| Permissions | None |
| Navigation Targets | UX-003 (onboarding) on success; UX-001 (Login) via link |
| Events Emitted | `signup_succeeded`, `signup_failed` |
| Expected Outputs | New user record + authenticated session |
| Assumptions | Network available; auth service reachable |

### Onboarding Profile Questionnaire (Screen ID: UX-003)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-002 |
| Acceptance Criteria | AC-011, AC-046 |
| Purpose | Capture initial self-reported communication style so C2/C4 personalization has a baseline from message 1. |
| User Goal | Tell the tool how I communicate so it doesn't start from zero. |
| Entry | Automatic redirect right after first successful login/signup with no existing profile record. |
| Exit | On submit → UX-004. |
| Primary Actions | Answer 3–5 questions (directness preference, emoji preference, formality level, and — v2.2/v2.3 addition — honorific level (합쇼체/해요체) as the default for EN→KO conversions, AC-046②); Submit. |
| Secondary Actions | None specified in docs/PRD.md (no "skip" defined — see Open Questions). |
| States | Loading: submit disabled + spinner while saving / Empty: unanswered form on load / Error: save-failed banner, answers retained / Success: brief confirmation then redirect. |
| Validation | docs/PRD.md does not specify which questions are mandatory; this document's working assumption is that all questions are required (see Open Questions). Submit stays disabled until every question has an answer; an unanswered-question indicator appears next to that question and clears the moment it's answered. |
| Failure | Save fails → banner "저장하지 못했습니다, 다시 시도해주세요" with retry; answers retained. |
| Accessibility | Each question is a fieldset with a legend; choice groups are keyboard-navigable with arrow keys; submit reachable via Tab; error banner uses `role="alert"`. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | High |
| Business Rules | Exactly one profile record per user, created here; later editable only via UX-009. |
| Data Required | 3–5 question responses (directness, emoji preference, formality, and honorific level (합쇼체/해요체) — exact question copy is not decided here; if honorific level would push the total past 5, T19 merges it into an existing question, an implementation detail not dictated here) |
| Data Operations | Create (profile record) |
| External Dependencies | None (no LLM call on this screen) |
| Permissions | Requires authenticated session |
| Navigation Targets | UX-004 |
| Events Emitted | `onboarding_completed` |
| Expected Outputs | Profile record used as default input to C2/C4 personalization in UF-003 |
| Assumptions | User is authenticated; this is the user's first login (no existing profile) |

### Two-Panel Mediation Workspace (Screen ID: UX-004)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-003 (primary), UF-004 (entry point to ticket conversion) |
| Acceptance Criteria | AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-015, AC-022, AC-029, AC-032, AC-041, AC-043, AC-046, AC-047, AC-048 |
| Purpose | Let a sender write a message, see how AI would classify/transform/backtranslate it, and approve or override before anything is "sent." |
| User Goal | Send a message that reads correctly to my counterpart without losing urgency or meaning. |
| Entry | Default landing screen after login/onboarding; nav menu "Mediate" tab. |
| Exit | Stays on screen after send (Recipient panel shows Delivered state); user may navigate away via the nav menu at any time. |
| Primary Actions | Enter recipient identifier; enter message text; Run Mediation; Override urgency level; Approve & Send. |
| Secondary Actions | Edit transformed text before approving; open Response Deadline Negotiation (UX-005) via the "Set response deadline" button OR directly from a Holiday Conflict warning (pre-fills the flagged deadline, AC-048③); open Scheduled Send (UX-006, NORMAL/LOW only); open Convert to Task Ticket (UX-007, shown only when the message reads as emotional); dismiss the emoji-culture warning. |
| States | Loading: "Run Mediation" shows an in-progress indicator across classify→convert→backtranslate steps (must not look frozen, AC-029) / Empty: Recipient panel shows a placeholder before first run / Error: failure banner with retry, draft text untouched (AC-029) / Warning: inline, non-blocking alerts drawn from `warnings[]` — emoji-culture (R1), honorific-level mixing (AC-046③), unregistered-honorific (AC-047②) — each labeled by type, never a single unlabeled "warning" blob / MisreadRisk: shown **before approval** whenever `misreadRisks[]` is non-empty (AC-043③); nothing renders if the array is empty (AC-043②, no hallucination). Two allowed presentation tiers (Planning Decision #57, see UX Decision Log): **Full** — each item shows quote / expected misreading / evidence as three separate labeled parts, expandable list; **Reduced** — a compact "오해 위험 N건" count badge with a keyboard-accessible tooltip carrying the same three-part text per item. Which tier is live is an implementer/schedule choice, not a per-user setting; underlying data generation (T1/T10/T11) is unaffected either way / HolidayConflict: shown whenever `holidayConflicts[]` is non-empty — "이 마감일은 상대 국가 연휴 N일차입니다" with a "기한 재협상" link into UX-005 (AC-048②/③); nothing renders if empty, including when the recipient's country has no hardcoded holiday-data entry (AC-048④; see Open Questions #8 for whether that "no data" case itself should ever surface to the user) / ReadyToApprove: full comparison visible, Approve & Send enabled / Delivered: Recipient panel switches to a timestamped log entry, inputs lock for that message / Fallback: visible "폴백 응답 사용 중" indicator when a cached/pre-scripted response is shown instead of a live result (AC-041). |
| Validation | Recipient identifier required (email format). Message text required, no explicit max length in docs/PRD.md — a soft cap (~5,000 characters) with a visible counter near the limit is recommended, not a hard block (see Open Questions). "Run Mediation" enabled only when recipient and message text are both valid/non-empty; format error shown inline under the recipient field, clears on edit. "Approve & Send" enabled only after a successful mediation run exists for the current text (disabled during Loading/Error) so an unreviewed message can never be sent. Misread Risk items and holiday-conflict warnings are advisory only — their presence or absence never enables/disables "Approve & Send" (AC-043's requirement is visibility before approval, not a gate). |
| Failure | LLM call times out/fails at any pipeline step → banner "처리에 실패했습니다" with "다시 시도"; message text is never cleared; if a prior successful transformation exists, approval of that last-good version remains possible, otherwise Approve & Send stays disabled. |
| Accessibility | Screen-reader reading order is Sender panel then Recipient panel regardless of visual column position. Urgency badge includes a text label, not color alone. Preserved items are marked bold AND labeled "(보존됨)," not bold alone. A live region announces mediation completion/failure, including when new Misread Risk or holiday-conflict warnings appear. Each Misread Risk item's three parts (quote/misreading/evidence) are exposed as separate labeled text for screen readers even in the Reduced tier's tooltip — tooltip content is reachable via keyboard focus, not hover-only. All controls keyboard-reachable in top-to-bottom, left-to-right order. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical |
| Business Rules | Processing order is fixed: C1 → (CRITICAL: skip to tone-only + immediate send) → C3 profile lookup → C5 terminology injection → C2 tone conversion with preservation filter (also producing `misreadRisks[]`, `warnings[]`, `holidayConflicts[]` in the same call, no extra LLM round trip — Planning Decision #49) → C4 backtranslation → (if emotional: offer C6 ticket link) → user approval → mock send + diff record (AC-032). No code path may send without explicit approval (AC-010, Planning Decision #5). CRITICAL messages receive tone refinement only, never scheduling/negotiation (AC-005). Preserved items must never be silently dropped (AC-006/007). Applied honorific level = pair protocol (if one exists for that recipient) overrides the sender's C3 profile "존댓말 레벨" on conflict (Planning Decision #26, AC-046②). An unregistered person's honorific is never invented — original form preserved + a "호칭 미등록" `warnings[]` entry (AC-047②); a Korean rank/title is never auto-translated into an English honorific with no registered mapping (AC-047③, "Manager Kim" pattern explicitly forbidden). The Misread Risk display may be reduced to its compact tier under schedule pressure without altering data generation/storage (Planning Decision #57) — reducing the display is not permitted to reduce what's generated or saved. |
| Data Required | sender (current user), recipient identifier, message text, urgency override (optional), pair protocol for that recipient (if exists), sender's global profile (including honorific level), project terminology dictionary (including person/honorific entries), prior diff history (personalization input only, not shown raw here), static holiday dataset (KR/US/GB/CN, 2026, hardcoded — Planning Decision #52) |
| Data Operations | Read (profile, pair protocol, dictionary, holiday dataset); Create (diff record, mock-send log entry on approval) |
| External Dependencies | Backend-proxied OpenAI calls for C1/C2/C4 (C5 injected into the C2 prompt); response cache + per-session rate limit (AC-041); static holiday dataset (no external API — Planning Decision #52) |
| Permissions | Requires authenticated session |
| Navigation Targets | UX-005, UX-006, UX-007; UX-009/UX-010/UX-011/UX-013/UX-015 via nav menu |
| Events Emitted | `mediation_requested`, `urgency_overridden`, `message_approved_sent`, `fallback_response_shown`, `holiday_conflict_deadline_negotiation_opened` |
| Expected Outputs | A diff record (AI suggestion vs. final approved text) for C3 learning; a mock-send log entry for the Recipient panel and UF-010's feedback view |
| Assumptions | User is authenticated; network/backend available; the recipient identifier does not need to resolve to a registered account for mediation to run, but pair-protocol personalization only applies if it does (see Open Questions); the message text contains an identifiable deadline for holiday-conflict checking — if none is present, `holidayConflicts[]` is simply empty, not an error |

### Response Deadline Negotiation Modal (Screen ID: UX-005)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-003 |
| Acceptance Criteria | AC-036, AC-048 |
| Purpose | Let the sender state a needed deadline and see whether it's realistic given the recipient's working hours (and their holidays), with a counter-offer if not. |
| User Goal | Set a deadline the recipient can actually meet, without guessing their time zone or holiday calendar by hand. |
| Entry | "Set response deadline" button on UX-004 (NORMAL/LOW messages only), OR the "기한 재협상" link on UX-004's Holiday Conflict warning (pre-fills the needed-by field with the flagged deadline, AC-048③). |
| Exit | "Use this deadline" / "Accept counter-offer" → closes modal, chosen deadline attached to the message on UX-004. "Cancel" → closes modal, no deadline attached. |
| Primary Actions | Enter needed-by date/time; Submit for feasibility check; Accept counter-offer OR keep original deadline. |
| Secondary Actions | Cancel. |
| States | Loading: feasibility check in progress / Empty: no deadline entered yet / Error: feasibility check failed / Result-Feasible: confirmation shown, "Use this deadline" enabled / Result-Infeasible: at least one counter-offered deadline shown alongside the original; user must actively pick one, nothing auto-changes (AC-036). |
| Validation | Deadline required, must be a future date/time. Submit enabled only when a valid future date/time is entered; invalid/past date shown inline under the field, clears on correction. |
| Failure | Feasibility check API fails → error banner with retry, input retained; user may cancel and proceed without a deadline. |
| Accessibility | Modal traps focus while open; Escape closes it (= Cancel), focus returns to the triggering button. Date/time picker has a keyboard-accessible text-entry alternative, not pointer-only. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Low (P2 feature) |
| Business Rules | The system may only propose a counter-offer, never auto-change the sender's deadline (AC-036). Requires the recipient's timezone + working hours — the same data model as R2 (T39 depends on T31's model). Counter-offer candidate dates must exclude dates that fall within the recipient's country holidays per the AC-048 hardcoded dataset (T39) — a counter-offer is not "realistic" if it lands on a holiday. |
| Data Required | sender's needed-by input; recipient's timezone + working hours; static holiday dataset (for counter-offer exclusion) |
| Data Operations | Read (recipient working-hours data, if available; holiday dataset) |
| External Dependencies | Backend feasibility-calculation service (deterministic time-window math, no LLM call) |
| Permissions | Requires authenticated session |
| Navigation Targets | Returns to UX-004 |
| Events Emitted | `deadline_feasibility_checked`, `deadline_confirmed` |
| Expected Outputs | A confirmed deadline value attached to the current message |
| Assumptions | Recipient's working-hours data exists or is entered manually (see Open Questions — data source unresolved, also flagged in docs/Tasks.md's own unverified-items list) |

### Scheduled Send Modal (Screen ID: UX-006)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-003 |
| Acceptance Criteria | AC-024 |
| Purpose | Let the sender queue a NORMAL/LOW message for the recipient's local morning instead of sending immediately. |
| User Goal | Avoid waking up or interrupting my counterpart outside their working hours. |
| Entry | "Schedule for their morning" button on UX-004 (NORMAL/LOW only — never shown for CRITICAL, AC-005/024). |
| Exit | "Confirm schedule" → closes modal, message marked scheduled on UX-004 (Recipient panel shows "예약됨" until the scheduled time). "Cancel" → closes modal, no schedule applied. |
| Primary Actions | View suggested local-morning time slot; Confirm; adjust the exact time within the recipient's morning window if offered. |
| Secondary Actions | Cancel. |
| States | Loading: computing recipient's local morning window / Result: suggested time shown / Error: could not compute (e.g., missing recipient timezone) / Confirmed: scheduling saved. |
| Validation | A recipient timezone must be available (from profile or manual entry) before a slot is suggested; if missing, the screen shows an inline explanation plus a manual-entry recovery path instead of a broken suggestion. |
| Failure | Missing recipient timezone → explanatory empty state + manual entry fallback. Backend save fails → error banner + retry. |
| Accessibility | Same modal focus-trap/Escape pattern as UX-005; time shown in both sender's and recipient's local time as text, not via a timezone abbreviation alone. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Low (P2 feature) |
| Business Rules | Never offered/applied to CRITICAL messages (AC-005 takes precedence). |
| Data Required | recipient timezone, recipient's local-morning window definition |
| Data Operations | Read (recipient timezone); Update (message's send-time/status) |
| External Dependencies | None beyond backend scheduling logic (no LLM call) |
| Permissions | Requires authenticated session |
| Navigation Targets | Returns to UX-004 |
| Events Emitted | `send_scheduled` |
| Expected Outputs | A scheduled-send timestamp attached to the message; UX-004's Recipient panel reflects "예약됨" until that time |
| Assumptions | A background job/scheduler exists to trigger the mock-delivery at the scheduled time (architect's mechanism to design) |

### Vent-to-Ticket View (Screen ID: UX-007)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-004 |
| Acceptance Criteria | AC-017, AC-018, AC-050 |
| Purpose | Turn an emotionally-charged message into a structured, actionable ticket without deleting the emotional signal. |
| User Goal | Get my complaint taken seriously as a real issue, not lost in a wall of text. |
| Entry | "Convert to Task Ticket" link on UX-004's Recipient panel (shown only when the message reads as emotional). |
| Exit | "Use this ticket" → returns to UX-004 with the ticket content as the message to approve/send. "Back to message" → returns to UX-004 with the original free-text message unchanged. |
| Primary Actions | View/edit the 4 sections ([문제 정의] / [영향·리스크] / [요청 사항] / [우려 수준]); Use this ticket. |
| Secondary Actions | Back to message (discard ticket, keep free text). |
| States | Loading: conversion in progress / Error: conversion failed, retry, original message untouched / Result: 4 filled sections shown, each independently editable, plus a read-only **결정 권한 상태** (Decision Authority Status) field — 확정/내부 승인 필요/검토 중/불명 — shown alongside its evidence sentence when determined, or explicitly labeled "불명" (never left blank) when the original text has no evidence for it (AC-050①/②). |
| Validation | No new required fields beyond what the AI populates. A section with genuinely no derivable content shows an explicit "없음" rather than being left blank (see Open Questions — not explicitly specified by AC-017/018, applied here by analogy to AC-020's no-fabrication principle). |
| Failure | Conversion API fails → error banner + retry; the user can always fall back to sending the original free-text message via "Back to message." |
| Accessibility | Each of the 4 sections is a labeled region (heading + content) for screen-reader navigation. [우려 수준] level shown as both a text label (e.g., "높음") and a visual indicator, not color alone. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Medium (P1 feature) |
| Business Rules | Emotional intensity must be preserved as metadata, never deleted (AC-018). Decision Authority Status is never inferred without textual evidence — absent evidence renders `불명`, matching the no-fabrication principle already applied to AC-020 (Planning Decision #54 — this feature's premise is an unverified hypothesis, not a confirmed fact; do not present the status as more certain than the text supports). |
| Data Required | original message text |
| Data Operations | Read (original text); no persistent write until the user proceeds to approve/send from UX-004 |
| External Dependencies | Backend C6 structuring API (LLM-backed, also produces `decisionAuthority` + evidence in the same call) |
| Permissions | Requires authenticated session |
| Navigation Targets | UX-004 |
| Events Emitted | `ticket_conversion_requested`, `ticket_used`, `ticket_discarded` |
| Expected Outputs | Structured 4-section text plus a Decision Authority Status value that replaces free text as the message body if "Use this ticket" is chosen |
| Assumptions | The "emotional" trigger detection happens on UX-004 before this screen is reachable; see Open Questions #9 on whether `decisionAuthority` is genuinely a single value per ticket (as T1's schema literally states) — for this screen (one message → one ticket) a single value is unambiguous, unlike UX-008's per-row case |

### Decision Summary & Unresolved Detector View (Screen ID: UX-008)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-005 |
| Acceptance Criteria | AC-019, AC-020, AC-038, AC-050 |
| Purpose | Turn a thread into a decisions table and flag agreements missing an owner or deadline. |
| User Goal | Know what was actually decided and what's still hanging, without re-reading the whole thread. |
| Entry | "Summarize thread" nav item. |
| Exit | Stays on screen after results (reference screen, not a step toward sending); nav menu to leave. |
| Primary Actions | Paste/enter thread text; Generate summary. |
| Secondary Actions | Re-run with edited thread text. |
| States | Loading: summarization in progress / Empty: no thread entered yet / Error: summarization failed, retry, input retained / Result: **Decision / Owner / Deadline / 결정 권한 상태** table (4th column added v2.2/v2.3, AC-050) + separate Unresolved warnings list. |
| Validation | Thread text required (non-empty) before "Generate summary" is enabled; no format restriction specified in docs/PRD.md. |
| Failure | Summarization API fails → error banner + retry, thread text retained. Any Decision/Owner/Deadline cell with no thread evidence renders as "미정" (AC-020); any 결정 권한 상태 cell with no thread evidence renders as "불명" (AC-050①) — both visually distinct from a failed-call error state, never silently blank. |
| Accessibility | Table uses proper header-cell semantics for screen readers. Each Unresolved warning states in text which field is missing (담당자/기한), not via icon alone. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Medium (P1 for the decision summary, AC-019/020, AC-050; P2 for the Unresolved Detector, AC-038 — matches docs/PRD.md MVP Scope rows 14 and 25) |
| Business Rules | Never fabricate an owner or deadline not evidenced in the thread text (AC-020). Never fabricate a 결정 권한 상태 not evidenced in the text — render "불명" instead (AC-050①, same no-fabrication principle). The Unresolved Detector only runs on/after a completed C7 summary (T26 must complete before T43, per docs/Tasks.md). Decision Authority Status is a per-decision-row value here (one thread can contain multiple distinct decisions at different authority levels) — see Open Questions #9 for a schema-granularity tension this raises for architect. This feature's underlying premise is an unverified hypothesis (Planning Decision #54) — never present it in the UI as a confirmed fact. |
| Data Required | thread text input |
| Data Operations | Read only (no persistent thread storage implied by docs/PRD.md) |
| External Dependencies | Backend C7 summarization API (reused C6 structuring logic, also producing per-row `decisionAuthority` + evidence) + Unresolved Detector logic layered on the C7 result |
| Permissions | Requires authenticated session |
| Navigation Targets | None forward (reference screen); nav menu to leave |
| Events Emitted | `thread_summarized`, `unresolved_items_detected` |
| Expected Outputs | Decision table (including Decision Authority Status per row) + Unresolved warning list for the user to act on manually |
| Assumptions | Thread text is pasted manually by the user; no live integration pulls thread history automatically |

### Profile Management Screen (Screen ID: UX-009)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-006 |
| Acceptance Criteria | AC-014 (screen); AC-012/AC-013 are backend behaviors this screen surfaces; AC-046 (honorific-level item, added v2.2/v2.3) |
| Purpose | Let a user see and control what the tool has learned about their communication style. |
| User Goal | Check that the tool's assumptions about me are correct, and fix them if not. |
| Entry | Nav menu "Profile." |
| Exit | Stays on screen; nav menu to leave. |
| Primary Actions | View profile items; Edit an item; Delete an item. |
| Secondary Actions | None. |
| States | Loading: skeleton while profile loads / Empty: "아직 학습된 항목이 없습니다" (edge case) / Error: load failed, retry / Success: full list shown (directness, emoji preference, formality, honorific level (합쇼체/해요체)), each item tagged "자기신고" (onboarding) or "학습됨" (3x diff pattern, AC-013) — the honorific-level item is always "자기신고" since it isn't a diff-learned field. |
| Validation | Edits use the same choice-based input as onboarding. Saving an empty edit is blocked — a value must be selected. |
| Failure | Save/delete fails → inline error on that item's row, value unchanged until retry succeeds. |
| Accessibility | List items keyboard-operable (edit/delete reachable via Tab, not hover-only). Delete requires an explicit confirmation step (see Interaction Patterns), announced via `role="alert"`. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Medium (P1 feature) |
| Business Rules | Only items with 3+ observed repeats become "학습됨" entries (AC-013). Items are user-owned and never shown to other users, including managers (Planning Decision #6). |
| Data Required | profile record (self-reported + learned fields); diff history (read-only reference for the 3x threshold, not itself displayed) |
| Data Operations | Read, Update, Delete |
| External Dependencies | None beyond the profile/diff storage layer |
| Permissions | Requires authenticated session; a user can only see/edit their own profile (AC-039) |
| Navigation Targets | None forward; nav menu to leave |
| Events Emitted | `profile_item_edited`, `profile_item_deleted` |
| Expected Outputs | Updated profile used by the next UF-003 run |
| Assumptions | User is authenticated; profile record exists (created at onboarding, UF-002) |

### Terminology Dictionary Management Screen (Screen ID: UX-010)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-007 |
| Acceptance Criteria | AC-015, AC-016, AC-047 |
| Purpose | Maintain a project's do-not-translate term list and person/honorific mappings. |
| User Goal | Stop the tool from mistranslating our team's jargon and misjudging who gets which honorific. |
| Entry | Nav menu "Terminology." |
| Exit | Stays on screen; nav menu to leave. |
| Primary Actions | Choose entry type (**용어** Term / **사람·호칭** Person) when adding; for Term: enter the term mapping; for Person: enter 실명 (real name) / 한국어 호칭 (Korean form of address) / 영어 호칭 (English form of address); Edit an entry; Delete an entry. |
| Secondary Actions | None (no search/filter — not requested in docs/PRD.md; list expected to stay small per Non-functional Expectations). |
| States | Loading: skeleton / Empty: "등록된 용어가 없습니다. 첫 용어를 추가하세요" / Error: load/save failed, retry / Success: list of entries, each visibly tagged by type (용어 / 사람·호칭) so the two kinds aren't visually conflated. |
| Validation | Term entries: term field required, non-empty; duplicate term (case-insensitive) blocked with inline error "이미 등록된 용어입니다," clears on edit. Person entries: 실명 required, non-empty; at least one of 한국어 호칭/영어 호칭 required (both may be filled, but a person entry with neither is meaningless — see Open Questions if docs/PRD.md's intent differs); duplicate 실명 blocked with inline error "이미 등록된 인물입니다," clears on edit. Add/Save enabled only when the active entry type's required fields are valid and non-duplicate. |
| Failure | Save/delete fails → inline error on the row/form, retry available, entered value retained. |
| Accessibility | Entry-type choice and add/edit form fully keyboard operable; list uses semantic list markup with the type tag exposed as text (not icon/color alone); delete requires confirmation. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Medium (P1 feature) |
| Business Rules | Registered terms must appear unmodified in C2 output (AC-015) — enforced by the C5 injection step in UF-003's pipeline, not by this screen directly. Registered honorifics (person entries) are used exactly as entered in both translation directions (AC-047①). An unregistered person's honorific is never guessed — original form preserved + a "호칭 미등록" warning surfaces on UX-004 (AC-047②). A Korean rank/title is never auto-translated into an English honorific when no mapping is registered (AC-047③) — this screen is the only way to register one. |
| Data Required | term list (term string, optional note/definition); person list (실명, 한국어 호칭, 영어 호칭) |
| Data Operations | Create, Read, Update, Delete (both entry types) |
| External Dependencies | None (this screen doesn't call the LLM; it manages data consumed by UF-003's C2/C5 step) |
| Permissions | Requires authenticated session; scope is project-level per docs/PRD.md's "팀 자산으로 축적" framing — whether "project" maps to a team/workspace concept is an architect decision (see Open Questions) |
| Navigation Targets | None forward; nav menu to leave |
| Events Emitted | `term_added`, `term_edited`, `term_deleted`, `person_entry_added`, `person_entry_edited`, `person_entry_deleted` |
| Expected Outputs | Updated term/person list consumed by the next UF-003 run |
| Assumptions | "Project" scope exists as a concept the architect will define; until then, one dictionary per authenticated user's project context is assumed; the entry-type distinction (Term vs. Person) is a single unified list with a type field, not two separate screens/tables — an implementer/architect data-modeling choice this document doesn't dictate beyond requiring both types to coexist in one management screen |

### Pair Communication Protocol Screen (Screen ID: UX-011)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-008 |
| Acceptance Criteria | AC-037 |
| Purpose | Let two specific users agree on 4 communication-style items that apply only to messages between them, overriding the global profile on conflict. |
| User Goal | Set explicit ground rules with this one counterpart instead of relying on my own default style guess. |
| Entry | Nav menu "Pair Protocols" → select/enter a counterpart; or "Set protocol with this recipient" link from UX-004. |
| Exit | Stays on screen after save; nav menu to leave, or "Back to message" if entered from UX-004. |
| Primary Actions | Select/enter counterpart identifier; Set/edit the 4 items (directness allowed / emoji use / form of address / deadline phrasing); Save. |
| Secondary Actions | None (no invite/notify mechanism — see Open Questions). |
| States | Loading: skeleton while any existing protocol loads / Empty: no protocol yet for this counterpart, form shows defaults / Error: load/save failed, retry / Success: saved values shown, editable again at any time. |
| Validation | Counterpart identifier required, valid email format. All 4 protocol items required before Save is enabled (see Open Questions — not explicitly required by AC-037, applied here since a partial protocol is not meaningful for AC-037's conflict-resolution logic). Inline errors clear on correction. |
| Failure | Save fails → inline error, retry, form values retained. |
| Accessibility | Each of the 4 items is a labeled, keyboard-operable choice control. Save confirmation uses icon + text, not color alone. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Low (P2 feature) |
| Business Rules | On conflict with the global C3 profile, the pair protocol value wins (AC-037, Planning Decision #26). Stored separately from the C3 profile table (Planning Decision #26). |
| Data Required | pair protocol record (keyed by the two user identities), counterpart identifier |
| Data Operations | Create, Read, Update |
| External Dependencies | None beyond storage; injected into the C2 prompt during UF-003 (same injection point as C5, per docs/Tasks.md T42) |
| Permissions | Requires authenticated session; both users in the pair can view/edit the same record (AC-037) |
| Navigation Targets | UX-004 (if entered from there) |
| Events Emitted | `pair_protocol_saved` |
| Expected Outputs | A pair-scoped override set consumed by the next UF-003 run between these two users |
| Assumptions | The counterpart is a registered user (see Open Questions — unresolved whether the counterpart must already have an account and whether they're notified when a protocol is proposed) |

### Meeting Time Suggestion Screen (Screen ID: UX-012)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-009 |
| Acceptance Criteria | AC-023 |
| Purpose | Find overlapping working hours between two people. |
| User Goal | Pick a meeting time without doing timezone math myself. |
| Entry | Nav menu "Meeting Times." |
| Exit | Stays on screen with results; nav menu to leave. |
| Primary Actions | Enter own timezone + available hours; enter counterpart's timezone + available hours; Get suggestions. |
| Secondary Actions | None. |
| States | Loading: computing overlap / Empty: no inputs yet / Error: computation failed, retry / Result-Found: up to 3 candidate times / Result-NoOverlap: explicit empty state explaining no overlapping window was found. |
| Validation | Both timezones and both available-hours ranges required before "Get suggestions" is enabled. Invalid range (end before start) blocked with inline error, clears on correction. |
| Failure | Computation fails → error banner + retry, inputs retained. |
| Accessibility | Time inputs keyboard-operable with accessible labels; results in semantic list markup; "no overlap" stated as text, not implied by an empty area alone. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Low (P2 feature) |
| Business Rules | Up to 3 candidates returned when overlap exists (AC-023). |
| Data Required | sender timezone/hours, recipient timezone/hours |
| Data Operations | Read (if saved profile-level working hours exist); otherwise manual entry only for this session — persisting working hours to profile is an architect decision (see Open Questions) |
| External Dependencies | None (deterministic time-window computation, no LLM call) |
| Permissions | Requires authenticated session |
| Navigation Targets | None forward; nav menu to leave |
| Events Emitted | `meeting_times_requested` |
| Expected Outputs | Up to 3 candidate meeting times |
| Assumptions | Working-hours data is entered manually each time or read from a saved profile field (architect to decide) |

### Response Feedback View (Screen ID: UX-013)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-010 |
| Acceptance Criteria | AC-025 |
| Purpose | Show whether mediation is actually improving response time and reply tone, using only real recorded replies. |
| User Goal | See evidence that this tool is helping, not just trust a claim. |
| Entry | Nav menu "Feedback." |
| Exit | Stays on screen; nav menu to leave. |
| Primary Actions | View list of sent messages with recorded reply time + sentiment; view before/after comparison summary. |
| Secondary Actions | None (no filter/date-range control — not requested in docs/PRD.md). |
| States | Loading: skeleton / Empty: "아직 기록된 답장이 없습니다" / Error: load failed, retry / Success: list + comparison summary shown. |
| Validation | N/A — read-only screen, no user input. |
| Failure | Data fails to load → error banner + retry. |
| Accessibility | Comparison values (e.g., average response time before/after) stated as text numbers, not by chart color alone. Sentiment classification shown as a text label (긍정/중립/부정) in addition to any icon/color. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Low (P2 feature) |
| Business Rules | Only messages with an actually-recorded reply are counted (AC-025) — no imputed/estimated data points. |
| Data Required | sent-message log (with mock-send timestamp), recorded reply arrival timestamp, reply sentiment classification |
| Data Operations | Read only |
| External Dependencies | Backend reply-tracking mechanism + sentiment classification (LLM-backed); how a "reply" is captured at all is not specified in docs/PRD.md (see Open Questions — the biggest unresolved mechanism in this feature) |
| Permissions | Requires authenticated session; user sees only their own sent-message history (AC-039) |
| Navigation Targets | None forward; nav menu to leave |
| Events Emitted | None (read-only) |
| Expected Outputs | None (terminal reference screen) |
| Assumptions | A reply-capture mechanism exists and populates the underlying data |

### Extension Mediation Overlay — GitHub, Slack & Gmail (Screen ID: UX-014)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-011, UF-012, UF-014 |
| Acceptance Criteria | AC-021, AC-040, AC-042, AC-051 |
| Purpose | Mirror the classify → convert → backtranslate → approve flow inside GitHub/Slack/Gmail's own input field, without ever auto-submitting. |
| User Goal | Get the same mediation help I'd get on the web app, without leaving the page I'm working in. |
| Entry | Click on the extension-injected "Mediate" button/icon next to a supported input field (GitHub PR/issue comment box, Slack message compose box, or — v2.2/v2.3 addition — Gmail compose body). |
| Exit | "Insert" → overlay closes, approved text is written into the host page's input field; user manually clicks that page's own send/submit control. "Cancel/Close" → overlay closes, host field unchanged. |
| Primary Actions | Trigger mediation on the field's current text; Override urgency; Edit transformed text; Insert. |
| Secondary Actions | Cancel/Close; Copy to clipboard (fallback if DOM insertion fails). |
| States | Loading: same pipeline progress concept as UX-004 / Error: failure banner + retry, plus copy-to-clipboard fallback if DOM insertion itself fails / NotLoggedIn: prompt to log in on the web app first / Result: comparison shown (urgency, transformed text, backtranslation) / Inserted: brief confirmation, overlay auto-closes. |
| Validation | No new input validation beyond UX-004's pattern. "Insert" is disabled until a successful mediation result exists for the current text — mirrors UX-004's Approve & Send gating, adapted since insertion (not sending) is the gated action here (AC-040). |
| Failure | LLM failure → same fallback/error pattern as UX-004, scaled to the overlay. DOM insertion failure (host site changed markup) → explicit error + "복사하기" fallback. Not logged in → NotLoggedIn state with a link to the web app's login. |
| Accessibility | Overlay is keyboard-dismissible (Escape = Cancel/Close); focus moves into the overlay on open and returns to the triggering button on close; all status text (urgency, warnings) available to screen readers, not conveyed by icon/color alone. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Medium (P1 feature) |
| Business Rules | The extension never clicks the host site's own send/submit control — no such code path exists (AC-040, AC-051, Planning Decision #5). Developer-mode-loaded extension only, no web store distribution in MVP (Planning Decision #4). |
| Data Required | text currently in the targeted host input field; sender = current authenticated user; recipient = derived from context where possible (GitHub PR/issue participants, Slack channel/DM, Gmail "To:" field) or manually entered if not derivable |
| Data Operations | Read (host field text); Create (diff record + mediation log, same as UX-004, on Insert) |
| External Dependencies | Same backend mediation API as UX-004; host page DOM (GitHub, Slack, or Gmail — selector logic differs per adapter, UI shape is identical) |
| Permissions | Browser extension permissions to read/write the DOM of github.com, the Slack workspace domain(s) in use, and mail.google.com; requires an authenticated session shared with the web app |
| Navigation Targets | None (overlay closes back into the host page) |
| Events Emitted | `extension_mediation_requested`, `extension_text_inserted`, `extension_insertion_failed` |
| Expected Outputs | Text written into the host field; a diff/log record identical in shape to UX-004's |
| Assumptions | User is already logged in via the shared web app session; the target site's DOM matches the adapter's expected selectors (GitHub PR/issue comment box, Slack message compose box, Gmail compose body); network available. Gmail's compose DOM is reputed complex/frequently-changing (docs/PRD.md Assumptions, unverified) — T49's first-hour spike determines feasibility; if it proves substantially harder than Slack's, Planning Decision #59's cut ordering (Gmail kept over Slack) may be revisited by planner, which would not change this screen's UI contract, only which adapters ship. |

### Sent Messages & Reminder Approval Screen (Screen ID: UX-015)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-013 |
| Acceptance Criteria | AC-044 |
| Purpose | Let the sender see everything they've sent, mark replies received, and review/approve AI-drafted reminders for messages that have gone unanswered past the business-day threshold. |
| User Goal | Know which of my messages haven't gotten a reply yet, and nudge the ones that need it without being pushy. |
| Entry | Nav menu "발송 내역" (Sent). |
| Exit | Stays on screen; nav menu to leave. |
| Primary Actions | Mark a message "답장 받음"; Review a suggested reminder ("리마인드 검토"); Approve & Send the reminder. |
| Secondary Actions | Edit the generated reminder text before approving (consistent with the app's standing human-in-the-loop editing pattern — see UX Decision Log). |
| States | Loading: skeleton list while sent messages load / Empty: "발송한 메시지가 없습니다" (no messages mock-sent yet) / Error: load failed, retry / Row-BelowThreshold: recipient, sent time, elapsed business days shown, no reminder action yet / Row-ThresholdReached: "무응답 N일째" badge + "리마인드 검토" action appears once elapsed business days ≥ 2 (Planning Decision #60) and the message is unmarked / ReminderReview: the C2-generated draft is shown for review (and optional edit) with Approve & Send / ReminderSent: row shows a timestamped "리마인드 발송됨" log entry, mirroring UX-004's Delivered state / Replied-Marked: row shows a static "답장 받음" state, reminder action permanently hidden for that message. |
| Validation | "답장 받음" requires no additional input — a single click marks it; there is no unmark control (no undo requested by docs/PRD.md, consistent with the Interaction Patterns' "Undo: not designed" rule). "Approve & Send" (reminder) enabled only once a reminder draft has successfully loaded for that row; disables immediately on click to prevent double-send. |
| Failure | Reminder-text generation fails → inline error "리마인드 문구 생성 실패" on that row + retry; no reminder text shown; "Approve & Send" stays disabled until a successful draft exists. Mark-replied or approve-send network failure → inline error on that row, the row's state reverts to its last-known value, retry available. |
| Accessibility | Rows are keyboard-operable list items (mark/review/approve reachable via Tab, not hover-only); each row's status (elapsed days, replied state, reminder availability) is exposed as text, never by color/badge-color alone; the reminder-review area is keyboard-dismissible and traps focus while open, consistent with this document's modal pattern. |
| Figma Frame | N/A — no Figma reference |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Low (P2 feature, MVP Scope #29 — this entire screen falls under the P2 layer that Planning Decision #1/#42 cuts first under schedule pressure) |
| Business Rules | Reply status is captured only via explicit manual "답장 받음" marking; no automated reply-detection code path exists (AC-044⑤, Planning Decision #51). Elapsed business days = calendar days minus weekends minus the recipient's country holidays from the AC-048 hardcoded dataset (AC-044②); if the recipient's country has no hardcoded entry, only weekends are excluded — see Open Questions #8 for whether that gap should ever surface to the user. The reminder threshold is a fixed constant = 2 business days (Planning Decision #60), isolated in a single backend constant; **this screen must not expose a settings/threshold-configuration control** — that was explicitly decided against. Reminder text is generated by the same C2 tone-conversion pipeline used elsewhere (T51), framed as a polite confirmation never a demand (verified upstream by 3 test cases); this screen only displays/edits/approves the result, it does not implement wording logic itself. No reminder is ever sent without an explicit approval click on this screen (AC-044④, Planning Decision #5). This screen's underlying sent-message log is the same storage the Response Feedback View (UX-013 / R4, AC-025) reads — Planning Decision #51 requires T33 to reuse T50's structure rather than a second table; do not design this as an independent data model (see UX Decision Log). |
| Data Required | sent-message log entries (recipient identifier, recipient country/timezone, sent_at timestamp, replied boolean, replied_marked_at); static holiday dataset (KR/US/GB/CN, 2026); generated reminder text (on demand, per row) |
| Data Operations | Read (sent-message log, holiday dataset); Update (mark replied=true + replied_marked_at); Create (reminder mock-send log entry + diff record on approval, mirroring UX-004's approval semantics) |
| External Dependencies | Backend business-day calculator (deterministic, holiday dataset lookup, no LLM call); backend C2 tone-conversion call for reminder-text generation (LLM-backed, subject to the same cache/rate-limit/fallback behavior as AC-041) |
| Permissions | Requires authenticated session; user sees only their own sent-message history (AC-039) |
| Navigation Targets | UX-005 not applicable here; this screen has no forward navigation target — nav menu to leave |
| Events Emitted | `reply_marked`, `reminder_reviewed`, `reminder_approved_sent` |
| Expected Outputs | Updated replied status on the sent-message record; a new mock-send log entry + diff record when a reminder is approved and sent |
| Assumptions | A sent-message log already exists, populated by UX-004's mock-send action (T50); the recipient's country/timezone is known at send time — this screen inherits the same unresolved dependency as Open Question #3 (recipient identification); the reminder draft edit control follows the same soft length guidance as UX-004 (no hard limit specified) |

## Deprecated
None — this revalidation pass against docs/PRD.md v2.3 found every existing flow/screen from Document Version 1.0 still supported by the PRD; nothing was superseded. All changes this round were extensions to existing entries plus new entries (UF-013, UF-014, UX-015), never removals.

## Information Architecture
**Routes**
- Unauthenticated: `/login` (UX-001), `/signup` (UX-002)
- Authenticated: `/` or `/mediate` (UX-004, default landing), `/onboarding` (UX-003, first-login only, forced), `/profile` (UX-009), `/terminology` (UX-010), `/pair-protocols` and `/pair-protocols/:counterpart` (UX-011), `/meeting-times` (UX-012), `/decisions` (UX-008), `/feedback` (UX-013), `/sent-messages` (UX-015, new v2.3)

**Navigation** — A persistent primary nav (top bar or left rail, implementer's visual choice) is present on every authenticated screen except UX-003 (onboarding is a forced first step with no nav escape until submitted — see Open Questions). It links: Mediate | Profile | Terminology | Pair Protocols | Meeting Times | Decisions | Feedback | **발송 내역 (Sent, new v2.3, → UX-015)**, plus Log out. This is navigation only, not a Dashboard/summary screen (see UX Decision Log). Adding the Sent nav item is not new feature invention — it is the entry point AC-044/T52 explicitly requires for the new screen; it does not aggregate/summarize other screens' data (that would be a Dashboard).

**Back/Cancel behavior** — Modals (UX-005, UX-006) Cancel or Escape returns to UX-004 with the draft message text unchanged. Browser Back on any authenticated screen returns to the previous in-app screen in history, defaulting to UX-004 if there is no history.

**Direct URL access** — Unauthenticated user hitting any protected route → redirect to UX-001 (Login); after success, redirect to the originally requested URL (standard post-login redirect), falling back to UX-004 if none was requested. Authenticated user hitting `/login` or `/signup` directly → redirect to UX-004. Authenticated user with no profile record hitting any URL other than `/onboarding` → forced redirect to UX-003 first (profile-first gate).

**Pre-login vs. post-login redirect** — Pre-login, every protected route redirects to Login. Post-login, the redirect target is the originally requested protected URL, falling back to UX-004.

**Chrome extension** — Has no independent navigation structure. It is a single contextually-injected overlay (UX-014), not a substitute for the web app's nav — the web app remains the primary demo path (Planning Decision #3).

## Interaction Patterns
- **Loading**: Every AI-backed action (mediation run, ticket conversion, thread summary) shows a step-labeled progress indicator (e.g., "분류 중 → 변환 중 → 역번역 중"), never a bare unlabeled spinner beyond ~1s, per AC-029's "must not look stopped."
- **Empty**: Every list/result screen has an explicit empty-state message with a next action, never a blank area.
- **Error**: Every failure shows (a) what happened in plain language, (b) a retry action, and (c) confirmation that in-progress user input was not lost.
- **Validation**: Inline, appears next to the offending field at first blur or first submit attempt, clears the instant the field becomes valid again. A form's primary submit action stays disabled until all required fields are valid.
- **Permission denied**: Not reachable via UI navigation in this design (AC-039 guarantees server-side data scoping). If a stale link somehow points to another user's resource, it is treated as "not found," not a raw 403, to avoid confirming the resource's existence to an unauthorized user.
- **Session expired**: Any authenticated screen whose next API call returns unauthorized shows a banner "세션이 만료되었습니다" and redirects to UX-001 on acknowledgment, preserving any in-progress draft text in local storage so it can be restored after re-login.
- **Offline**: Not designed — always-online is the MVP assumption (docs/PRD.md's own Open Question #5, resolved via Planning Decision #31 — distinct from this document's Open Questions #5 below, which concerns reply capture, not offline support). A connectivity failure is treated identically to the generic Error pattern; no offline queueing.
- **Retry**: Every retry button re-attempts the exact same request with the exact same input, never silently altering it.
- **Duplicate/double-click submission**: Every submit-type control (Run Mediation, Approve & Send, Save, Add term, etc.) disables itself immediately on click until the request resolves.
- **Stale or already-deleted data**: If a user acts on a profile item, term, or pair-protocol entry deleted elsewhere before the action completes, the server rejects it and the screen shows "이 항목은 이미 삭제되었습니다" and refreshes the list — it never silently no-ops.
- **Very long text/overflow**: Text areas scroll internally rather than expanding the page indefinitely. The comparison view (UX-004) truncates long backtranslation/transformed text with a "더 보기" expand control, never hard-clipping content the user needs to review before approving.
- **Slow response**: If a mediation call exceeds a few seconds (the ~5s felt-target in docs/PRD.md's Non-functional Expectations), the loading indicator's step labels keep advancing so the user can tell it's still working. There is no separate "slow" state distinct from Loading.
- **Confirmation**: Destructive actions (delete profile item, delete term) require an explicit confirm step ("삭제하시겠습니까?" with Confirm/Cancel) before executing.
- **Undo**: Not designed — docs/PRD.md does not request undo for any action. Deletions are confirmed-before-execution instead, consistent with the product's human-in-the-loop philosophy (Planning Decision #5).
- **Fallback/cached response indicator** (project-specific, AC-041): Whenever a screen shows a pre-scripted/cached response instead of a live LLM result, a visible, persistent label reads "폴백 응답 사용 중" near the result — distinct from the generic Error pattern because the content is still usable, just not live, and must not be mistaken for a live model result.
- **Human-in-the-loop approval** (project-specific, applies to UX-004/UX-007/UX-014/UX-015): No AI-generated output is ever transmitted/inserted without an explicit click of an approval-labeled control (Approve & Send / Insert). Overrides (urgency level, edited text) always take precedence over the AI's original suggestion in what is sent/inserted and what is diffed for C3 learning.
- **Degradable display under schedule pressure** (project-specific, AC-043, Planning Decision #57): Some advisory data (currently: Misread Risk on UX-004) is allowed a "reduced" display tier — a compact count badge + tooltip instead of the full per-item breakdown — so that a schedule-pressure cut can shrink the display work alone without touching data generation/storage. Whenever a screen documents both a Full and Reduced tier, the underlying data must be identical between tiers; only presentation density differs, and reverting from Reduced to Full must never require regenerating or re-fetching data that already exists.
- **No-fabrication explicit labeling** (project-specific, applies to any AI-derived status/field without textual evidence — AC-020, AC-038, AC-047②, AC-048④, AC-050①): When the system cannot determine a value from the source text/data, it shows an explicit label ("미정" / "불명" / "휴일 데이터 없음" / a specific "미등록" warning) rather than leaving the field blank or guessing — blank and "correctly determined but empty" must never look identical to the user.

## Accessibility
| Item | Value |
|---|---|
| Keyboard Navigation | All primary/secondary actions on every screen are reachable via Tab/Shift+Tab in the reading order defined per screen; Enter activates the focused primary action; Escape closes any modal/overlay. |
| Focus Order | Top-to-bottom, left-to-right within a screen's reading order. Two-panel screens (UX-004) use Sender-panel-then-Recipient-panel order regardless of visual column position. |
| Screen Reader Support | All form fields have programmatically associated labels; all status/urgency/sentiment/concern-level values are exposed as text, never by icon/color alone; error and success banners use `role="alert"`/`role="status"`; live pipeline-progress updates use a polite live region. |
| Color Contrast | All text and interactive controls meet at least WCAG 2.1 AA contrast ratios (4.5:1 normal text, 3:1 large text/UI components) — implementer verifies against the final visual design; color values are out of ux-design's scope. |
| Touch Target Size | Minimum 44×44 CSS px for all interactive controls on Tablet/Mobile breakpoints (WCAG 2.5.5). |
| Error Messaging | Every error state across every screen in this document is conveyed by icon + text together, never by color/border alone. |

## Responsive Behavior
| Breakpoint | Layout Changes |
|---|---|
| Desktop | UX-004's Sender/Recipient panels render side by side (the "two-panel" concept). All other screens use a single-column layout with the persistent nav visible as a top bar or left rail (implementer's choice). |
| Tablet | UX-004's two panels stack vertically (Sender panel above Recipient panel), preserving the reading order defined in Accessibility. All other screens remain single-column; the nav collapses to a top bar if it was a left rail on Desktop. |
| Mobile | Same vertical stacking as Tablet for UX-004. Nav collapses to a menu (e.g., hamburger). Modals (UX-005/UX-006) become full-screen rather than a centered dialog. Mobile is designed to not break rather than to be optimized — docs/PRD.md frames this as a desktop-primary demo tool, not a Mobile-first product. |

Chrome extension (UX-014): "No breakpoint-specific behavior" — the extension only runs inside a desktop browser by nature, so no separate responsive treatment applies.

## Claude Design Prompts
One ready-to-paste prompt per screen or coherent screen group, for generating a visual UI mockup in Claude Design (claude.ai). Each prompt restates only what the Screen Catalog and Interaction Patterns already specify. Mockups are visual references only; this document remains the authoritative spec.

### Auth Screens (covers: UX-001, UX-002)
| Item | Value |
|---|---|
| Source Screens | UX-001 Login Screen, UX-002 Sign Up Screen |
| Last Synced With | Document Version 1.0 |

```
Design two related web screens for a B2B collaboration tool: a Login screen and a Sign Up screen.

Login screen: email field, password field, a "Log in" primary button, and a "Sign up" secondary link. States to show: empty (default), a form-level error banner reading "이메일 또는 비밀번호가 올바르지 않습니다" above the fields (use an icon plus red text, not color alone), and a loading state where the submit button shows a spinner and is disabled.

Sign Up screen: email field, password field (with a show/hide toggle), confirm-password field, a "Sign up" primary button, and a "Log in" secondary link. Show an inline validation error under the confirm-password field for a mismatch, and a form-level error banner for "이미 가입된 이메일입니다" with a link back to Login.

Both screens: keyboard-first design (visible focus states), labels attached to every field, primary action disabled until required fields are valid. Desktop layout: centered card, comfortable width. No breakpoint-specific redesign needed beyond the card staying centered and readable on narrower widths — this is a desktop-primary tool.

Keep visual styling minimal/neutral (no brand system specified yet) — focus on clear hierarchy: heading, form, primary action, secondary link.
```

### Onboarding Profile Questionnaire (covers: UX-003)
| Item | Value |
|---|---|
| Source Screens | UX-003 Onboarding Profile Questionnaire |
| Last Synced With | Document Version 2.0 |

```
Design a one-page onboarding questionnaire screen for a cross-border collaboration tool. Purpose: capture a new user's self-reported communication style (3-5 questions covering: directness vs. indirectness preference, emoji usage preference, formality level, and honorific level (합쇼체/해요체) for Korean output) so the tool can personalize message tone conversions from the very first use.

Layout: each question is its own labeled group (e.g., a fieldset with clear question text and a small set of choice options - not free text). A single "제출" (Submit) primary button at the bottom, disabled until every question has an answer, with an inline indicator next to any unanswered question.

States to show: default (empty form), an error banner "저장하지 못했습니다, 다시 시도해주세요" with answers still filled in, and a brief success/confirmation moment before redirecting away.

Accessibility: each question keyboard-navigable via arrow keys within its choice group, clear visible focus indicators, submit button reachable via Tab.

Keep it simple and non-intimidating — this is a short first-run form, not a long survey.
```

### Two-Panel Mediation Workspace (covers: UX-004)
| Item | Value |
|---|---|
| Source Screens | UX-004 Two-Panel Mediation Workspace |
| Last Synced With | Document Version 2.0 |

```
Design the core screen of a cross-border collaboration mediation tool: a two-panel workspace where a user writes a message and sees, side by side, how it will be classified and transformed before sending.

Layout (Desktop): two columns side by side.
LEFT — Sender panel: a recipient identifier input (email), a large message text area, an urgency badge showing CRITICAL / NORMAL / LOW with a short reasoning sentence beneath it, and an override control letting the user change the urgency level manually. A "Run Mediation" primary button.
RIGHT — Recipient panel: the transformed message text with preserved items (deadlines, numbers, required actions) visually bolded AND labeled "(보존됨)" — never relying on bold alone. Below it, a short "변환 이유" (conversion reason) line, and a backtranslation section showing the transformed text translated back to the original language, with a permanently visible limitation notice: "완전한 검증이 아니라 큰 오역을 걸러내는 1차 안전장치입니다." An "Approve & Send" primary button, disabled until a mediation result exists.

Below the backtranslation section, before the Approve & Send button, show a "오해 위험" (Misread Risk) area that appears ONLY when the tool found something — design two variants: (a) Full — a small list where each item shows three labeled parts: the quoted phrase from the original, the expected misreading, and the reasoning, each expandable; (b) Reduced — a compact badge reading "오해 위험 N건" with a tooltip/expand-on-focus showing the same three-part text per item, more compact. If there is nothing to flag, this area shows nothing at all (no empty box).

Also show, non-blocking and inline: (1) an honorific-level-mixing warning (only if the tool caught inconsistent 합쇼체/해요체 endings within the same Korean output), (2) an "호칭 미등록" (honorific not registered) warning naming the unrecognized person if applicable, (3) a holiday-conflict warning reading "이 마감일은 상대 국가 연휴 N일차입니다" with a small "기한 재협상" link/button, shown only if the stated deadline falls on the recipient's country holiday.

States to design: 
- Empty (before first run): right panel shows a neutral placeholder.
- Loading: a step-labeled progress indicator across "분류 중 → 변환 중 → 역번역 중" (not a bare spinner), so it never looks frozen.
- Warning: an inline, non-blocking alert for culturally-risky emoji usage, and/or a small note if the tool caught something worth double-checking.
- Error: a banner "처리에 실패했습니다" with a "다시 시도" retry button; the message text the user wrote is never cleared.
- Fallback: a persistent small label "폴백 응답 사용 중" shown near the result when a cached/pre-scripted response is displayed instead of a live one.
- Delivered (after approval): the right panel switches to a "전달됨" state with a timestamp log entry.

Secondary elements: a small "Convert to Task Ticket" link (appears only for emotionally-charged messages), a "마감 기한 협상" button and a "수신자 아침 시간에 예약" button, both only relevant for NORMAL/LOW urgency.

Tablet/Mobile: the two panels stack vertically, Sender panel above Recipient panel, same reading order.

Accessibility: urgency badge shows a text label, not color alone; all warnings shown as icon + text, never color alone; all interactive elements have visible keyboard focus states; the Misread Risk tooltip content must be reachable by keyboard focus, not hover-only.

None of the Misread Risk / warning / holiday-conflict elements ever disable the Approve & Send button — they are advisory only.

Keep the visual tone professional/neutral — this is a serious workplace tool, not playful.
```

### Deadline Negotiation & Scheduled Send Modals (covers: UX-005, UX-006)
| Item | Value |
|---|---|
| Source Screens | UX-005 Response Deadline Negotiation Modal, UX-006 Scheduled Send Modal |
| Last Synced With | Document Version 2.0 |

```
Design two small modal dialogs that open on top of a message-composition workspace.

Modal 1 — Response Deadline Negotiation: a date/time input for "필요 기한" (needed-by deadline, may arrive pre-filled if opened from a holiday-conflict warning), a "확인" button to check feasibility. Result states: (a) feasible — a simple confirmation and a "이 기한 사용" button; (b) infeasible — the original requested deadline shown alongside at least one system-suggested counter-offer deadline (counter-offers never land on the recipient's country holidays), with the user required to explicitly pick one (never auto-selected) via "원래 기한 유지" or "역제안 수락" buttons. Include a "취소" (Cancel) link/button.

Modal 2 — Scheduled Send: shows a suggested send time in the recipient's local morning, displayed in both the sender's and the recipient's local time as text labels (not just a timezone abbreviation). A "예약 확정" primary button and a "취소" button. An empty/error state for when the recipient's timezone isn't available yet, with a manual timezone entry field as a fallback.

Both modals: standard modal styling (dimmed backdrop, centered card on Desktop, full-screen on Mobile), Escape key closes and acts as Cancel, clear visible focus trap while open.
```

### Vent-to-Ticket View (covers: UX-007)
| Item | Value |
|---|---|
| Source Screens | UX-007 Vent-to-Ticket View |
| Last Synced With | Document Version 2.0 |

```
Design a screen that converts an emotionally-written message into a structured task ticket with exactly 4 labeled sections: [문제 정의] (Problem Definition), [영향·리스크] (Impact/Risk), [요청 사항] (Request), and [우려 수준] (Concern Level). Each section is independently editable text. [우려 수준] should show both a text label (e.g., "높음"/"중간"/"낮음") and a visual indicator — never color alone — representing the preserved emotional intensity of the original message (explicitly NOT deleted, just restructured).

Also show a read-only "결정 권한 상태" (Decision Authority Status) field near the 4 sections, with one of these values: 확정 (Confirmed) / 내부 승인 필요 (Needs Internal Approval) / 검토 중 (Under Review) / 불명 (Unknown) — shown together with a short evidence sentence when determined, and explicitly labeled "불명" (not left blank) when the original text gives no evidence.

Primary action: "이 티켓 사용" button. Secondary action: "메시지로 돌아가기" link/button that discards the ticket and returns to the original free-text message.

States: loading (conversion in progress), error (conversion failed, with retry, original message untouched), and result (all 4 sections populated and editable). If a section has no derivable content, show an explicit "없음" rather than leaving it blank.

Keep the tone respectful of the emotional content — this screen exists specifically so a frustrated message gets taken seriously as a structured issue, not dismissed.
```

### Decision Summary & Unresolved Detector View (covers: UX-008)
| Item | Value |
|---|---|
| Source Screens | UX-008 Decision Summary & Unresolved Detector View |
| Last Synced With | Document Version 2.0 |

```
Design a screen with a large text input for pasting a conversation thread, and a "요약 생성" (Generate Summary) button. Below it, once generated, show two distinct sections:

1. A table with columns: 결정사항 (Decision) / 담당자 (Owner) / 기한 (Deadline) / 결정 권한 상태 (Decision Authority Status: 확정/내부 승인 필요/검토 중/불명). Any Decision/Owner/Deadline cell with no evidence in the thread text shows "미정" explicitly; any Decision Authority Status cell with no evidence shows "불명" explicitly — neither is ever left blank or guessed.

2. A separate "미확정 항목" (Unresolved Items) warning list below the table: each entry names which field is missing (담당자 and/or 기한) in plain text, not via icon alone.

States: empty (no thread entered), loading, error (with retry, input preserved), and result (table + warnings both shown together).

Accessibility: table uses real header cells for screen readers; warnings are readable as plain text, not icon-only.
```

### Profile Management Screen (covers: UX-009)
| Item | Value |
|---|---|
| Source Screens | UX-009 Profile Management Screen |
| Last Synced With | Document Version 2.0 |

```
Design a settings-style screen listing a user's learned communication-style profile items (e.g., directness preference, emoji preference, formality level, honorific level (합쇼체/해요체)). Each item shows: its current value, a small tag indicating its source — "자기신고" (self-reported) or "학습됨" (learned from repeated corrections) — and Edit/Delete controls.

States: loading (skeleton list), empty ("아직 학습된 항목이 없습니다"), error (load failed, retry), success (populated list).

Delete requires an explicit confirmation step ("삭제하시겠습니까?" with Confirm/Cancel) before it takes effect — never an instant, unconfirmed delete.

Keyboard-operable throughout (edit/delete reachable via Tab, not hover-only).
```

### Terminology Dictionary Management Screen (covers: UX-010)
| Item | Value |
|---|---|
| Source Screens | UX-010 Terminology Dictionary Management Screen |
| Last Synced With | Document Version 2.0 |

```
Design a CRUD-style screen for managing a project's "do-not-translate" term list AND a person/honorific mapping list, combined in one screen. An "추가" (Add) form at the top starts with an entry-type choice: 용어 (Term) or 사람·호칭 (Person). If Term is chosen, show a single text field. If Person is chosen, show 3 fields: 실명 (real name) / 한국어 호칭 (Korean form of address) / 영어 호칭 (English form of address). Below the form, a list shows every registered entry with a visible type tag (용어 / 사람·호칭) and Edit/Delete controls per row.

States: loading (skeleton), empty ("등록된 용어가 없습니다. 첫 용어를 추가하세요"), error (retry), success (populated list showing both entry types).

Validation to depict: an inline error "이미 등록된 용어입니다" (Term) or "이미 등록된 인물입니다" (Person) under the relevant field when a duplicate is entered, clearing once corrected. Delete requires confirmation before executing.

No search or filter control — the list is expected to stay small (a few hundred items at most), so keep this deliberately simple.
```

### Pair Communication Protocol Screen (covers: UX-011)
| Item | Value |
|---|---|
| Source Screens | UX-011 Pair Communication Protocol Screen |
| Last Synced With | Document Version 1.0 |

```
Design a screen for two people to agree on communication ground rules for messages between just the two of them. A counterpart identifier field (email) at the top. Below it, 4 labeled choice controls: 직설 허용 (directness allowed), 이모지 사용 (emoji use), 호칭 (form of address), 마감 표현 (deadline phrasing style). A "저장" (Save) primary button.

States: loading (skeleton while any existing protocol for this counterpart loads), empty (no protocol yet, form shows sensible defaults), error (save/load failed, retry), success (saved values shown, still editable).

Note in the UI, subtly, that these values override the user's own global communication profile when the two conflict for this specific counterpart — this is the whole point of the screen.

Keyboard-operable choice controls throughout; save confirmation shown with an icon plus text, not color alone.
```

### Meeting Time Suggestion Screen (covers: UX-012)
| Item | Value |
|---|---|
| Source Screens | UX-012 Meeting Time Suggestion Screen |
| Last Synced With | Document Version 1.0 |

```
Design a screen with two input groups side by side or stacked: "내 시간대·가능 시간" (my timezone + available hours) and "상대방 시간대·가능 시간" (counterpart's timezone + available hours). A "추천 받기" (Get suggestions) button.

Result states: up to 3 candidate overlapping meeting times shown as a clear list once found; an explicit "겹치는 시간이 없습니다" (no overlapping window found) empty state with a short explanation when none exist — never just a blank list.

States: loading (computing), error (retry, inputs retained).

Validation: inline error if an available-hours range has the end time before the start time.
```

### Response Feedback View (covers: UX-013)
| Item | Value |
|---|---|
| Source Screens | UX-013 Response Feedback View |
| Last Synced With | Document Version 1.0 |

```
Design a read-only screen showing evidence of whether message mediation is helping. Top section: a simple before/after comparison summarizing average response time and reply-sentiment distribution, pre- vs. post-mediation, shown with clear text labels/numbers (not relying on chart color alone to convey the comparison). Below it: a list of individual sent messages, each showing its recorded reply arrival time (elapsed time) and a sentiment classification label (긍정/중립/부정).

States: loading (skeleton), empty ("아직 기록된 답장이 없습니다"), error (retry), success (populated).

No filter or date-range controls — keep this simple and read-only, showing only messages that actually received a recorded reply (never fabricated/estimated data points).
```

### Extension Mediation Overlay — GitHub, Slack & Gmail (covers: UX-014)
| Item | Value |
|---|---|
| Source Screens | UX-014 Extension Mediation Overlay |
| Last Synced With | Document Version 2.0 |

```
Design a compact overlay panel (browser extension popup/inline panel style, smaller footprint than a full webpage) that appears next to a comment/message input field on a third-party site (GitHub PR comment box, Slack message compose box, or Gmail compose body). The overlay mirrors a message-mediation result: an urgency badge (CRITICAL/NORMAL/LOW, text label not color-only) with an override control, the transformed message text with preserved items marked, and a backtranslation section with the standard limitation notice ("완전한 검증이 아니라 1차 안전장치").

Primary action: "삽입" (Insert) button — disabled until a successful mediation result exists. Secondary actions: "취소/닫기" (Cancel/Close), and a "복사하기" (copy to clipboard) fallback action shown only in the DOM-insertion-failure error state.

States: loading (compact progress indicator), error (failure banner + retry, plus the clipboard fallback for DOM-insertion failures specifically), not-logged-in (a prompt directing the user to log in via the web app first), result (comparison shown), inserted (brief confirmation, then the overlay auto-closes).

Important constraint to reflect visually: there is no "send" or "submit" button in this overlay at all — only "삽입" (Insert) into the existing input field. The user must go use the host site's own send button themselves, which is not part of this overlay.

Keyboard-dismissible (Escape closes), focus moves into the overlay on open and returns to the trigger button on close.
```

### Sent Messages & Reminder Approval Screen (covers: UX-015)
| Item | Value |
|---|---|
| Source Screens | UX-015 Sent Messages & Reminder Approval Screen |
| Last Synced With | Document Version 2.0 |

```
Design a screen listing a user's previously sent messages for a cross-border collaboration tool. Each row shows: recipient identifier, sent time, and elapsed business days since sending (a plain number, e.g. "업무일 3일째"). A "답장 받음" (Reply received) button/toggle on each row lets the user manually mark that a reply arrived — there is no automatic reply detection, so this is the only way a message's status changes.

For rows that have gone unanswered 2 or more business days and are not marked replied, show a small badge (e.g. "무응답 3일째") and a "리마인드 검토" (Review reminder) action. Clicking it reveals an AI-drafted reminder message, worded as a polite confirmation (never a demand), which the user can edit before clicking "Approve & Send" — no reminder is ever sent without this explicit approval click.

States: loading (skeleton list), empty ("발송한 메시지가 없습니다"), error (retry), and a populated list mixing rows in different states: below-threshold (no reminder action yet), threshold-reached (reminder badge + review action), reminder-under-review (draft shown, editable, approve button), reminder-sent (a "리마인드 발송됨" timestamped log entry), and replied-marked (a static "답장 받음" state with no reminder action).

Do NOT include any settings/threshold-configuration control on this screen — the 2-business-day threshold is fixed and not user-adjustable.

Accessibility: every row's status conveyed as text, not color/badge-color alone; reminder review area keyboard-dismissible.
```

## UX Decision Log
Append-only — never rewrite or delete a past entry. If docs/PRD.md changes make a decision no longer valid, add a new entry and mark the old one's Status as Superseded or Deprecated — never delete it.

### Two-Panel Workspace Interpreted as Single-User Before/After Comparison, Not a Two-Account Inbox
| Item | Value |
|---|---|
| Decision | UX-004's "Recipient panel" is a preview rendered within the sender's own screen (what the recipient would see), not a separate inbox the recipient's own account logs into. |
| Reason | AC-009 asks for "the same message's before/after side by side" on one screen, and Open Question #11's resolution defines the web app's "전송" as a mock send arriving in the Recipient panel + a log entry — both point to a single-screen comparison, not a delivered-message system. |
| Alternatives Considered | A full two-account messaging/inbox system where the recipient's own login shows a received-messages list. |
| Rejected Because | docs/PRD.md never requests an Inbox/Messages-list feature; building one would be scope creep under the "don't invent features" rule and would consume schedule the PRD explicitly protects for Core (C1–C7). |
| Impact | Architecture — no per-recipient message-thread storage is required for MVP display, only a sender-scoped mock-send log. |
| Status | Active |

### Recipient Identification via Manual Free-Text Field, No Directory/Contact-List
| Item | Value |
|---|---|
| Decision | The recipient is identified on UX-004/UX-011 via a manually-typed email/username field, with no directory, contact list, or search feature. |
| Reason | The core I/O schema (docs/PRD.md Constraints, AC-027) requires a `recipient` field, but no directory/contact feature is requested anywhere in docs/PRD.md. |
| Alternatives Considered | Building a team/contact directory the sender could search or pick from. |
| Rejected Because | Directory/Search is explicitly listed among the feature types ux-design must not invent unless the PRD calls for it — it doesn't here. |
| Impact | Architecture/API — only a recipient identifier field + validation is needed, not a directory endpoint. |
| Status | Active |

### Persistent Nav Bar Is Navigation Only, Not a Dashboard Screen
| Item | Value |
|---|---|
| Decision | The cross-screen navigation menu (Mediate / Profile / Terminology / Pair Protocols / Meeting Times / Decisions / Feedback) is documented under Information Architecture, not as its own Screen ID with dashboard-style content. |
| Reason | docs/PRD.md never requests a Dashboard/home-summary screen; the nav's only job is switching between already-scoped screens. |
| Alternatives Considered | A dedicated "Home"/Dashboard screen summarizing recent activity across features. |
| Rejected Because | Dashboard is explicitly listed among the feature types not to invent unless requested. |
| Impact | None — navigation-only, no data aggregation logic implied for architect. |
| Status | Active |

### Chrome Extension GitHub and Slack Overlays Share One Screen Definition (UX-014)
| Item | Value |
|---|---|
| Decision | UX-014 covers both the GitHub adapter (UF-011) and the Slack adapter (UF-012) as a single Screen Catalog entry, rather than two near-duplicate entries. |
| Reason | The overlay's UI shape, states, actions, and validation are identical between the two target sites; the only difference is which DOM selectors the adapter targets, which is an implementation/adapter concern (docs/Tasks.md T47 explicitly reuses T29's adapter structure). |
| Alternatives Considered | A fully separate screen spec per target site. |
| Rejected Because | Would duplicate the entire spec with zero UX difference, adding maintenance burden without value, and diverging if one copy is updated and the other isn't. |
| Impact | Architecture — per-adapter selector logic differs (noted in UX-014's Architect Handoff), but the UI contract is one screen. |
| Status | Active |

### Destructive Actions Use Explicit Confirmation, Not Undo-After-the-Fact
| Item | Value |
|---|---|
| Decision | Deleting a profile item (UX-009) or a terminology entry (UX-010) requires an explicit "삭제하시겠습니까?" confirm step before executing; no undo/toast-based recovery is designed. |
| Reason | Matches the product's core human-in-the-loop philosophy (Planning Decision #5 — no consequential action happens without explicit human confirmation), applied here to destructive UI actions as well as AI-generated sends. |
| Alternatives Considered | Soft-delete with an "실행 취소" (undo) toast after the fact. |
| Rejected Because | docs/PRD.md never requests undo functionality anywhere; adding it would be unrequested scope on a tight 17-day schedule. |
| Impact | None beyond the confirm-step UI itself. |
| Status | Active |

### Gmail Overlay Absorbed into Existing UX-014 Definition, Not a Separate Screen (v2.3)
| Item | Value |
|---|---|
| Decision | UX-014 (renamed "Extension Mediation Overlay — GitHub, Slack & Gmail") covers the Gmail adapter (UF-014, AC-051) as part of the same single Screen Catalog entry that already covered GitHub (UF-011) and Slack (UF-012), rather than a third near-duplicate screen. |
| Reason | Applies the same reasoning already recorded for the GitHub/Slack merge: the overlay's UI shape, states, actions, and validation are identical across all three host sites; only DOM selector logic differs, and docs/Tasks.md's T49 explicitly reuses T29's adapter structure with "DOM 선택자만 분리." |
| Alternatives Considered | A fully separate UX-016 "Gmail Mediation Overlay" screen. |
| Rejected Because | Would triple-duplicate an already-duplicated spec with zero UX difference, and would drift if one copy were updated (e.g., a states/accessibility change) without the others. The prior GitHub+Slack merge decision already established the precedent and reasoning for this product. |
| Impact | Architecture — a third adapter's selector logic is now noted in UX-014's Architect Handoff (Gmail compose body, "To:" field for recipient derivation), but the UI contract remains one screen for all three adapters. |
| Status | Active |

### Misread Risk Warning Documents Two Allowed Presentation Tiers (Full / Reduced)
| Item | Value |
|---|---|
| Decision | UX-004 defines two allowed presentations for `misreadRisks[]` — **Full** (per-item quote/misreading/evidence, expandable list) and **Reduced** (a compact "오해 위험 N건" count badge with a keyboard-accessible tooltip carrying the same per-item text) — both documented now rather than only the full version. |
| Reason | docs/PRD.md Planning Decision #57 allows T12's display work alone to shrink under schedule pressure while T1/T10/T11 (schema/generation/validation) stay intact. If only the Full tier were specified here, implementer would have no ux-design-approved fallback to ship under pressure and would need an emergency ux-design re-engagement exactly when schedule pressure is highest — defeating the purpose of Decision #57's allowance. |
| Alternatives Considered | Specifying only the Full display and leaving the Reduced fallback to be improvised by implementer if/when the cut happens. |
| Rejected Because | An improvised fallback under deadline pressure is exactly the kind of ambiguity this document exists to prevent — reviewer/QA would have nothing to check the reduced form against. |
| Impact | implementer may ship either tier and reviewer/QA can verify either against this spec; QA must additionally confirm the underlying `misreadRisks[]` data is still generated and stored regardless of which tier is displayed (data generation is never part of the cut). |
| Status | Active |

### Sent Messages Screen and Response Feedback View Share One Storage Concept
| Item | Value |
|---|---|
| Decision | UX-015 (Sent Messages & Reminder Approval) and UX-013 (Response Feedback View) are documented as two different read/edit surfaces over one shared sent-message record set, not two independent data models. |
| Reason | docs/PRD.md Planning Decision #51 explicitly requires T33 (R4, AC-025) to reuse T50's storage structure rather than building a second table — silence detection needs only boolean+timestamp fields, and R4 is described as "그 위에 답장 본문·감정 분류를 얹는 상위 집합" (a superset layered on top). |
| Alternatives Considered | Independent per-screen storage, each screen owning its own sent-message table. |
| Rejected Because | Would duplicate mock-send log data and risk the two screens showing divergent reply/timestamp data for the same underlying message — and directly contradicts the PRD's explicit no-duplicate-implementation instruction. |
| Impact | Architecture/Database — one schema/table serves both screens' reads; architect should not design two. |
| Status | Active |

### Reminder Draft on UX-015 Is Editable Before Approval
| Item | Value |
|---|---|
| Decision | UX-015 allows editing the C2-generated reminder text before "Approve & Send," mirroring the pre-approval editing already established for UX-004/UX-007/UX-014's AI-generated output. |
| Reason | AC-044 doesn't prohibit edits, and this product's standing Interaction Pattern ("Human-in-the-loop approval") is that no AI-generated text is final until a human can review and adjust it before it's transmitted. Making the reminder draft read-only would be an unexplained, inconsistent regression from a pattern already active everywhere else in this document, not a new invented capability. |
| Alternatives Considered | A read-only reminder draft with only Approve-or-Reject, no edit. |
| Rejected Because | Every other AI-generated text surface in this product already permits pre-approval editing; carving out one silent exception here serves no requirement in docs/PRD.md and would surprise a user familiar with the rest of the tool. |
| Impact | implementer must wire an editable text field into the reminder-review state, not a static text block. |
| Status | Active |

### Decision Authority Status Granularity Differs by Screen — Flagged, Not Silently Resolved
| Item | Value |
|---|---|
| Decision | UX-007 (one message → one ticket) shows a single `decisionAuthority` value for the whole ticket. UX-008 (one thread → a multi-row decision table) shows `decisionAuthority` **per decision row**, per docs/Tasks.md T27's explicit instruction ("요약 표에 결정 권한 상태 컬럼 추가"). |
| Reason | A single thread can contain several distinct decisions at different authority levels (one confirmed, one still needing internal sign-off) — collapsing that into one thread-level value would hide exactly the distinction AC-050 exists to surface. T27's own wording ("column" in "the table") only makes sense as a per-row value. |
| Alternatives Considered | Treating `decisionAuthority` as a single value everywhere, matching docs/Tasks.md T1's literal schema description ("다건 배열이 아닌 단일 상태값"). |
| Rejected Because | T1's "single value" description and T27's "column in the summary table" instruction are in tension for the multi-decision UX-008 case — ux-design cannot silently pick one without flagging the conflict, since it changes what shape of data architect needs to store (one field on a message record vs. one field per row of a derived decision list). This is recorded as Open Question #9 for architect rather than guessed at. |
| Impact | Architecture/Database — architect must resolve whether `decisionAuthority` is stored per-message or per-decision-row before finalizing docs/Database.md's schema for the C7 output. |
| Status | Active — pending architect resolution, see Open Questions #9 |

### Onboarding Treated as Forced and Fully Required (Working Assumption)
| Item | Value |
|---|---|
| Decision | UX-003 (Onboarding) is designed as non-skippable with all 3–5 questions required before Submit is enabled. |
| Reason | AC-011 describes answering the questions and the profile being saved, without describing a skip path; docs/PRD.md's own Risks table separately calls out a cold-start risk ("초기 개인화 정보 부족") that a skippable/partial onboarding would make worse. |
| Alternatives Considered | Optional/skippable questions, or an entirely skippable onboarding step. |
| Rejected Because | Not because it's confirmed wrong, but because docs/PRD.md doesn't actually say either way — this is recorded as a working assumption, not a settled fact, and is also logged as an Open Question for confirmation. |
| Impact | Architecture — affects whether a profile record always exists post-first-login (assumed yes) or can be partial/absent. |
| Status | Active — pending confirmation, see Open Questions #2 |

## Open Questions
A row's Status is `open` until the named Owner decides, then `answered` with the outcome recorded in the Decision column.

| # | Question | Priority | Owner | Reason | Blocking Impact | Suggested Resolution | Status | Decision |
|---|---|---|---|---|---|---|---|---|
| 1 | What password policy applies to Sign Up (UX-002)? docs/PRD.md never specifies one. | Medium | Architect | Password rules are a security/auth-provider decision explicitly assigned to architect (docs/PRD.md Constraints), but no minimum is stated anywhere. | implementer cannot build UX-002's client-side validation without a concrete rule. | Minimum 8 characters, no additional complexity rule for MVP — matches the "간단 로그인" (simple login) framing of Planning Decision #30. | open | |
| 2 | Is Onboarding (UX-003) skippable, and are all 3–5 questions mandatory? | Medium | Planner | AC-011 says answering the questions saves a profile, but doesn't state whether skipping is allowed or what happens to personalization if it is skipped. | Blocks the forced-redirect gate logic (Information Architecture) and UX-003's Submit-enablement rule. | Make onboarding non-skippable with all questions required (the working assumption applied throughout this document) — confirm or override. | open | |
| 3 | How is the message recipient identified in the UI — is it always a free-text email field, and must the recipient already be a registered account for mediation to run at all, or only for personalization (pair protocol, R2/R3 scheduling) to activate? | High | Architect / Planner | The core I/O schema includes a `recipient` field (AC-027) but docs/PRD.md never specifies how it's captured in the UI, and this affects UX-004, UX-005, UX-006, UX-011, UX-012 simultaneously. **(v2.3 update)** It now also affects UX-015 (Silence Detector), which needs the recipient's country/timezone at send time to compute business-day elapsed and holiday exclusion (AC-044②/AC-048), and UX-005's holiday-aware counter-offer logic (T39). | implementer cannot finalize recipient input/validation, pair-protocol account-linking, or the Silence Detector's business-day calculation without this. | Free-text email field; mediation (C1/C2/C4) runs regardless of whether it matches a registered account, but pair-protocol/scheduling/holiday personalization only activates if it does — the interpretation applied throughout this document. Confirm or correct. | open | |
| 4 | When one user proposes/edits a Pair Communication Protocol (UX-011), is the counterpart notified, or must they separately navigate to the same screen to discover it? | Medium | Planner | AC-037 requires both sides to be able to view/edit the protocol, but doesn't require a notification, and Notification is a feature type ux-design must not invent unless the PRD calls for it. | Affects whether UF-008 is realistically usable without a way for the counterpart to know a protocol exists to review. | No notification in MVP; counterparts discover the shared protocol by navigating to Pair Protocols themselves — acceptable for a demo with a small number of known test accounts. | open | |
| 5 | How is a "reply" actually captured for the Response Feedback View (UX-013)/R4 — webhook, manual mark-as-replied, or extension-side observation? | Medium | Architect | AC-025 requires reply arrival time + sentiment, but docs/PRD.md never specifies the capture mechanism, and real server-side integration with Slack/GitHub is explicitly out of scope (docs/PRD.md Out of Scope list). | Without a capture mechanism, UX-013 has no way to be populated with real data at all — this was the largest open mechanism gap in the whole design. | — | **answered** | **(v2.3) Resolved by docs/PRD.md Planning Decision #51/#60 (MVP Scope #29, AC-044): reply capture is manual only — the user marks "답장 받음" themselves on UX-015; no automated/extension-side/webhook detection is built (explicit "자동 응답 감지 코드 경로가 존재하지 않는다," AC-044⑤). UX-013 and UX-015 share the same manually-marked sent-message record set (Planning Decision #51, see UX Decision Log). This document's Open Question #5 is answered by the PRD itself, not by ux-design's own working assumption.** |
| 6 | What is the maximum message length on UX-004 (and correspondingly UX-014)? docs/PRD.md sets no limit. | Low | Architect | Needed for both UI truncation/counter behavior and backend/LLM token-budget planning. | Minor — implementer can proceed with a placeholder limit, but a firm number should come from LLM context-window planning. | Soft cap of ~5,000 characters with a visible counter near the limit, no hard block below that (as currently documented on UX-004). Confirm this is compatible with the chosen LLM's context budget and the ~5s felt-response NFR target. | open | |
| 7 | Should a Ticket View (UX-007) section with no derivable content show "없음," or be left blank? | Low | Planner / User | AC-017/AC-018 don't specify empty-section handling; this document applied the same no-fabrication principle as AC-020 by analogy, which is a judgment call worth confirming rather than silently assuming. | Minor — affects only the empty-section rendering rule on one screen. | Show "없음" explicitly (as currently documented on UX-007) — confirm or override. | open | |
| 8 | When the recipient's country has no entry in the AC-048 hardcoded holiday dataset (only KR/US/GB/CN are covered), should UX-004's holiday-conflict area and UX-015's business-day count ever surface a "휴일 데이터 없음" (no holiday data) note to the user, or stay silent (identical to "no conflict found")? | Low | Planner / User | AC-048④ requires the system to internally label this case "휴일 데이터 없음" rather than fabricate a guess, but doesn't say whether that label must be user-visible or is purely an internal/test-verification label (T53's regression tests need to distinguish "no conflict" from "no data," which doesn't necessarily mean the UI must). | Minor — affects only whether one extra, rarely-triggered state is designed on UX-004/UX-015; doesn't block the core Silence Detector or holiday-warning behavior either way. | Keep it internal/test-only for MVP (no distinct user-visible state) — showing "we don't have holiday data for this country" for every non-KR/US/GB/CN recipient risks cluttering the UI with a caveat most demo users won't act on, and AC-048④'s requirement is satisfiable by the backend/test layer alone. Revisit if real users outside these 4 countries become common post-demo. | open | |
| 9 | Is `decisionAuthority` (AC-050) a single value per message/ticket, or a per-row value on UX-008's multi-decision summary table? docs/Tasks.md T1 describes it as "다건 배열이 아닌 단일 상태값" (a single, non-array value), but T27 instructs "요약 표에 결정 권한 상태 컬럼 추가" (add a column to the summary table), which only makes sense per-row when a thread yields multiple decisions. | High | Architect | This is a genuine schema-design tension between two planner-owned task descriptions that ux-design cannot resolve on its own — see UX Decision Log entry "Decision Authority Status Granularity Differs by Screen." | Blocks architect's docs/Database.md schema for the C7 output (one field on a message/ticket record vs. one field per row of a derived decision list) and blocks implementer's T27 UI work until the shape is settled. | Model it as per-decision-row for UX-008 (matching T27's literal instruction and the reality that one thread can yield several decisions at different authority levels) and as a single value for UX-007 (matching T1's description, where one ticket genuinely is one message). Confirm or correct. | open | |

