The authoritative record of what this project is supposed to be lives in `.claude/snapshot/SNAPSHOT.md`, produced by the `/snapshot` skill.

Any key design decisions MUST be raised to and then confirmed by the user first. Confirmed decisions are captured in SNAPSHOT.md at the next `/snapshot` run — do not maintain any separate design record.

A fresh snapshot is required before any branch is merged into `main` (enforced by `scripts/git-hooks/pre-merge-commit`), so the updated SNAPSHOT.md rides in with the merge. Merge into `main` with `--no-ff` — fast-forward merges bypass the hook.
