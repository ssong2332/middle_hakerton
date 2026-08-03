# Guard Scripts — Coding Rule

Owner: User (see AGENTS.md ownership table — `.claude/hooks/**` is User-owned, read-only to every agent). These are the PreToolUse guards wired in `.claude/settings.json`. This rule governs code written here; it does not apply to the project's own source code — that's `docs/CodingRules.md`, set once architect picks a stack.

## Rule
Guard scripts must use dependency-free, procedural Node.js with shallow control flow, defensive fail-open parsing, explicit exit codes (`0` = allow, `2` = block — the PreToolUse contract), minimal why-only comments, and actionable error messages citing the governing project rule (CLAUDE.md / AGENTS.md / docs/GitWorkflow.md). Avoid abstractions unless they materially reduce repeated logic — `lib/read-hook-input.js` exists because three scripts had identical stdin-read-and-JSON-parse boilerplate, not on principle; a fourth guard reuses it rather than re-pasting the block a fourth time.

## Why fail-open, specifically
These guards are a best-effort layer on top of prohibitions already stated in project docs — not the sole barrier to what they block. A guard whose failure mode is "block everything" turns a parsing bug into a stuck session, which is worse than the thing it was guarding against. Fail-open is a deliberate choice for *these* guards, not a universal default: a guard that would be the *sole* barrier to something catastrophic (not just a documented-elsewhere prohibition) should fail closed instead, and say so explicitly in its own header comment. Copying "fail-open" onto a higher-stakes guard without re-deriving whether it still applies is the mistake this note exists to prevent.

## Known limitation
String-matching on the full Bash command text can't distinguish "the literal token appears" from "the literal token is what's actually being acted on" — a command that merely mentions `.env` or `git commit` inside an unrelated string (an echo, a commit message, a heredoc) can false-positive. This happened repeatedly during this kit's own development. It's an accepted trade-off for a lightweight, dependency-free guard, not a defect to silently work around — when it fires on something legitimate, rephrase the command rather than weakening the pattern.

## Files
| File | Blocks |
|---|---|
| `block-main-writes.js` | `git commit` while on main/master; a refspec push that writes a different branch straight into main/master |
| `block-no-verify.js` | `--no-verify`, `--no-gpg-sign`, and other hook/signing-bypass git flags |
| `block-env-access.js` | Read/Edit/Write/NotebookEdit on `.env`; Bash commands that would print or overwrite it |
| `lib/read-hook-input.js` | Shared stdin-read + JSON-parse helper (fail-open on a malformed payload) |
