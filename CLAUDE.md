@AGENTS.md

This repo is for development on SpendRight, a personal finance app primarily centered around credit card spending optimization. It is in very early stages.

# Snapshot

`.claude/snapshot/SNAPSHOT.md` is the authoritative record of what this project is supposed to be — everything intentionally implemented, and everything intentionally absent or deferred. Read it before making code changes. It is refreshed via the `/snapshot` skill, which is required before any branch merges into `main` (enforced by `scripts/git-hooks/pre-merge-commit`; merge with `--no-ff`, since fast-forward merges bypass the hook).

# Comments

Avoid writing long comments in the code -- important information about the code that needs to be described in text belongs in SNAPSHOT.md, captured during the next `/snapshot`. This repo is entirely agent authored/maintained, so no need to optimize heavily for human viewing.

# Code Intelligence

Prefer LSP over Grep/Glob/Read for code navigation:

- `goToDefinition` / `goToImplementation` to jump to source
- `findReferences` to see all usages across the codebase
- `workspaceSymbol` to find where something is defined
- `documentSymbol` to list all symbols in a file
- `hover` for type info without reading the file
- `incomingCalls` / `outgoingCalls` for call hierarchy

Before renaming or changing a function signature, use
`findReferences` to find all call sites first.

Use Grep/Glob only for text/pattern searches (comments,
strings, config values) where LSP doesn't help.

After writing or editing code, check LSP diagnostics before
moving on. Fix any type errors or missing imports immediately.
