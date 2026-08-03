#!/usr/bin/env node
// PreToolUse guard for Bash: blocks hook-skipping / signing-bypass git flags.
// Enforces CLAUDE.md/AGENTS.md: "Never skip hooks or bypass signing unless
// the user has explicitly asked for it."
const { readHookInput } = require("./lib/read-hook-input");

readHookInput((payload) => {
  const command = payload?.tool_input?.command;
  if (typeof command !== "string" || !/\bgit\b/.test(command)) process.exit(0);

  const skipPatterns = [
    /--no-verify\b/,
    /--no-gpg-sign\b/,
    /-c\s+commit\.gpgsign=false\b/,
    /-c\s+core\.hooksPath=/,
  ];
  const hit = skipPatterns.find((p) => p.test(command));
  if (hit) {
    console.error(
      `Blocked: git command skips hooks/signing (matched ${hit}). Never use --no-verify/--no-gpg-sign/a hook-bypass config unless the user explicitly asked for this exact command this turn.`
    );
    process.exit(2);
  }

  process.exit(0);
});
