# Coding Rules — 크로스보더 협업 중재 서비스

Owner: User (architect may draft on request). All agents read-only.

## Prohibitions
- No new dependencies without an entry in DECISIONS.md.
- No commented-out code in commits.
- No `any`/untyped escapes where the language supports types.

## Naming
| Target | Convention | Example |
|---|---|---|
| Files | {{kebab-case / PascalCase / ...}} | {{...}} |
| Functions | {{camelCase / snake_case}} | {{...}} |
| Classes/Types | {{PascalCase}} | {{...}} |
| Constants | {{UPPER_SNAKE}} | {{...}} |

## Directory Rules
| Path | Contains | Must not contain |
|---|---|---|
| {{src/domain}} | {{business logic}} | {{framework imports}} |
| {{src/api}} | {{...}} | {{...}} |

## Style
- Formatter: {{prettier/black/... + config location}}
- Linter: {{eslint/ruff/... + config location}}
- Max function length: {{n}} lines (guideline, not hard rule)

Note: while Formatter/Linter are unconfigured, the DoD Gate's "Lint passes" item cannot be executed, and every release will need an explicit user-approved skip. Configure these early — ideally right after the architect pass fixes the stack.

## Error Handling
{{project pattern — e.g., Result type / exceptions at boundary only}}

## Tests
- Location: {{tests/ or co-located}}
- Naming: {{test_*.py / *.test.ts}}
- Minimum: every P0 feature has at least one happy-path and one failure-path test.
- A test must be able to fail. Write it before the code that satisfies it and keep the failing run — see docs/DefinitionOfDone.md's test-first Gate item.
- Structural assertions and semantic assertions are different claims and must be labelled as such. Asserting that a response is non-empty, matches a schema, or contains an expected substring is a *structural* check; it is never evidence that the content is correct. Where output is generated rather than fixed (model responses, templated copy, translations), a structural check alone leaves the actual requirement untested — the suite goes green while the product can still say something false.
