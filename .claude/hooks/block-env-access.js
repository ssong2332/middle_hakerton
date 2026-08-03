#!/usr/bin/env node
// PreToolUse guard for Read/Edit/Write/NotebookEdit and Bash: blocks the
// agent from reading, editing, printing, or overwriting the real .env file.
// Enforces CLAUDE.md Secrets Management: only .env.example is tracked;
// secret values are never read or exposed by an agent.
//
// String-matching on Bash commands is a best-effort layer, not a hard
// security boundary — it catches the common/accidental cases this rule
// exists for, not a deliberately obfuscated bypass.
const { readHookInput } = require("./lib/read-hook-input");

readHookInput((payload) => {
  const toolName = payload?.tool_name;
  const ti = payload?.tool_input || {};

  const isEnvPath = (p) => {
    if (typeof p !== "string") return false;
    const base = p.replace(/\\/g, "/").split("/").pop() || "";
    return /^\.env(\..+)?$/.test(base) && base !== ".env.example";
  };

  if (["Read", "Edit", "Write", "NotebookEdit"].includes(toolName)) {
    if (isEnvPath(ti.file_path)) {
      console.error(
        `Blocked: ${toolName} on "${ti.file_path}". CLAUDE.md: .env holds real secrets and must never be read/edited/printed by an agent — only .env.example is tracked. Ask the user to manage .env directly.`
      );
      process.exit(2);
    }
    process.exit(0);
  }

  if (toolName === "Bash") {
    const command = ti.command;
    if (typeof command !== "string") process.exit(0);

    // ".env" as its own path segment, excluding ".env.example" and friends.
    const envRefPattern = /(^|[\s"'`/\\:])\.env(?!\.\w)(?=[\s"'`/\\:)]|$)/;
    if (!envRefPattern.test(command)) process.exit(0);

    const revealsOrOverwrites =
      /\b(cat|type|more|less|head|tail|bat|Get-Content|code|vim|nvim|nano|notepad|cp|copy|scp|curl|tee)\b/i.test(
        command
      ) || />>?\s*['"]?\.env(?!\.\w)/.test(command);

    if (revealsOrOverwrites) {
      console.error(
        `Blocked: command reads/prints/overwrites ".env" — CLAUDE.md forbids exposing secret values. Command: ${command}`
      );
      process.exit(2);
    }
  }

  process.exit(0);
});
