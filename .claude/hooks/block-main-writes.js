#!/usr/bin/env node
// PreToolUse guard for Bash: blocks `git commit` while on main/master, and
// blocks a `git push` refspec that writes a *different* branch into
// main/master without a local merge (e.g. `git push origin fix/x:main`).
// Enforces docs/GitWorkflow.md ("No direct commits to main").
//
// Deliberately does NOT block a plain `git push` / `git push origin main`
// while legitimately on main — that is the orchestrator's/user's normal
// final step after merging a task branch (AGENTS.md "Who Merges"), and
// blocking it would make that required step impossible, not enforce
// anything. Only a commit that bypasses review can ever land new content
// on main in the first place; once that is blocked, a same-branch push
// only ever ships history that already went through a real merge.
const { readHookInput } = require("./lib/read-hook-input");

readHookInput((payload) => {
  const command = payload?.tool_input?.command;
  if (typeof command !== "string") process.exit(0);

  const isCommit = /\bgit\s+commit\b/.test(command);
  // e.g. "git push origin fix/x:main" or "git push origin HEAD:master" —
  // an explicit source ref other than main/master written into main/master.
  const isBypassPush = /\bgit\s+push\b[^\n]*\s(?!(?:main|master)\b)[\w./-]+:(main|master)\b/.test(command);
  if (!isCommit && !isBypassPush) process.exit(0);

  const { execSync } = require("child_process");
  let branch = "";
  try {
    branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch {
    process.exit(0); // not a git repo / no commits yet — nothing to protect
  }
  const onProtectedBranch = branch === "main" || branch === "master";

  if (isCommit && onProtectedBranch) {
    console.error(
      `Blocked: "git commit" while checked out on "${branch}". docs/GitWorkflow.md prohibits direct commits to main — create a task branch first (feat/fix/docs per the branch table).`
    );
    process.exit(2);
  }

  if (isBypassPush) {
    console.error(
      `Blocked: refspec push writes a different branch directly into main/master without a local merge. docs/GitWorkflow.md: merge locally (fast-forward preferred) as the orchestrator/user, then push — never push a branch straight into main's ref.`
    );
    process.exit(2);
  }

  process.exit(0);
});
