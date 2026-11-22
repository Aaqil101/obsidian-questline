# Questline

Questline is a community plugin for Obsidian. Goals are outcomes, projects are the effort, tasks are the unit, and progress rolls up. Everything is plain Markdown, with no Dataview, Kanban, or Templater dependency.

> Goals are outcomes. Projects are the effort. Tasks are the unit.

## Phase 0 verification

The progress, timespan, and Timekeep engines are checked against a real
Projects & Goals vault:

```bash
QUESTLINE_REFERENCE_VAULT="/path/to/00 - P&Q" npm run verify:vault
```

The harness is read-only and fails if any vault file changes. Its last
comparison is recorded in
[docs/phase-0-verification.md](docs/phase-0-verification.md).

