# Questline

Questline is a community plugin for Obsidian. Goals are outcomes, projects are the effort, tasks are the unit, and progress rolls up. Everything is plain Markdown, with no Dataview, Kanban, or Templater dependency.

> Goals are outcomes. Projects are the effort. Tasks are the unit.

## Inspiration

Questline is inspired by [Christian Bager Bach Houmann's Projects and Goals system](https://bagerbach.com/blog/projects-and-goals-obsidian/) and its [DemoVault](https://github.com/chhoumann/DemoVault). Questline rebuilds that goal-to-project-to-task model without Dataview, Kanban, QuickAdd, MetaEdit, or Templater.

That guide is only the baseline for Questline, not a fixed specification: fields, behavior, and UI can and will change as the plugin evolves.

## Phase 0 verification

The progress, timespan, and Timekeep engines are checked against a real
Projects & Goals vault:

```bash
QUESTLINE_REFERENCE_VAULT="/path/to/00 - P&Q" npm run verify:vault
```

The harness is read-only and fails if any vault file changes. Its last
comparison is recorded in
[docs/phase-0-verification.md](docs/phase-0-verification.md).

