# Phase 0 verification against the reference P&Q vault

- Vault: reference P&Q vault
- Names: anonymized placeholders
- Run: 2026-11-22T03:00:31.160Z
- Goals: 7
- Projects: 28
- Excluded project notes: 10 tagged but unmarked, 5 untagged
- Vault writes: none

## Projects

| Project | Questline | Dataview | Excluded | Timekeep h | Declared h |
| --- | --- | --- | --- | --- | --- |
| Project 01 | 4/4 (100%) | 4/4 (100%) | 0 | 0 | — |
| Project 02 | 5/5 (100%) | 5/5 (100%) | 0 | 0 | 24.8 |
| Project 03 | 1/1 (100%) | 1/4 (25%) | 3 | 0 | — |
| Project 04 | 0/0 (0%) | 0/0 (0%) | 0 | 0 | — |
| Project 05 | 4/4 (100%) | 4/4 (100%) | 0 | 0 | — |
| Project 06 | 1/1 (100%) | 1/2 (50%) | 1 | 0 | 32.62 |
| Project 07 | 2/2 (100%) | 2/2 (100%) | 0 | 0 | 0 |
| Project 08 | 6/6 (100%) | 6/6 (100%) | 0 | 0 | — |
| Project 09 | 6/6 (100%) | 6/6 (100%) | 0 | 0 | 12.64 |
| Project 10 | 13/13 (100%) | 13/13 (100%) | 0 | 0 | — |
| Project 11 | 4/4 (100%) | 4/4 (100%) | 0 | 0 | — |
| Project 12 | 3/3 (100%) | 3/3 (100%) | 0 | 0 | — |
| Project 13 | 5/5 (100%) | 5/5 (100%) | 0 | 2 | 2 |
| Project 14 | 0/0 (0%) | 0/0 (0%) | 0 | 3.17 | — |
| Project 15 | 4/4 (100%) | 4/4 (100%) | 0 | 0 | 21.42 |
| Project 16 | 1/1 (100%) | 1/1 (100%) | 0 | 0 | — |
| Project 17 | 4/4 (100%) | 4/4 (100%) | 0 | 0 | 14.14 |
| Project 18 | 4/4 (100%) | 4/4 (100%) | 0 | 0 | — |
| Project 19 | 4/4 (100%) | 4/4 (100%) | 0 | 19.23 | 19.23 |
| Project 20 | 5/5 (100%) | 5/6 (83%) | 1 | 0 | — |
| Project 21 | 5/5 (100%) | 5/5 (100%) | 0 | 7.55 | — |
| Project 22 | 1/1 (100%) | 1/2 (50%) | 1 | 0 | 0 |
| Project 23 | 2/3 (67%) | 2/3 (67%) | 0 | 0 | — |
| Project 24 | 1/1 (100%) | 1/2 (50%) | 1 | 4.82 | 4.82 |
| Project 25 | 8/8 (100%) | 8/8 (100%) | 0 | 16.06 | 16.06 |
| Project 26 | 1/1 (100%) | 1/1 (100%) | 0 | 0 | 1.5 |
| Project 27 | 1/1 (100%) | 1/1 (100%) | 0 | 0 | 5 |
| Project 28 | 5/7 (71%) | 5/8 (63%) | 1 | 0 | — |

## Goals

| Goal | Questline | Dataview | Timespan | Due | Days left | Overdue |
| --- | --- | --- | --- | --- | --- | --- |
| Goal A | 67/67 (100%) | 67/69 (97%) | ♾Infinite | never | — | no |
| Goal B | 5/7 (71%) | 5/8 (63%) | 📅🔟 Years | 2034-10-15 | 2884 | no |
| Goal C | 3/4 (75%) | 3/7 (43%) | ♾Infinite | never | — | no |
| Goal D | 18/18 (100%) | 18/20 (90%) | ♾Infinite | never | — | no |
| Goal E | 2/2 (100%) | 2/2 (100%) | 📅1️⃣ Year | 2026-10-10 | -43 | yes |
| Goal F | 0/0 (0%) | 0/0 (0%) | 📆1️⃣ Month | 2025-12-15 | -342 | yes |
| Goal G | 5/5 (100%) | 5/5 (100%) | ♾Infinite | never | — | no |

## Work hours

- Timekeep matches the stored total for Project 13 (2 h), Project 19 (19.23 h), Project 22 (0 h), Project 24 (4.82 h), Project 25 (16.06 h).
- Stored totals with no timekeep block: Project 02 (24.8 h), Project 06 (32.62 h), Project 09 (12.64 h), Project 15 (21.42 h), Project 17 (14.14 h), Project 26 (1.5 h), Project 27 (5 h). The note has no block to recompute from, so the stored value cannot be verified.
- A timekeep block with a blank `work_hours` field: Project 14 (3.17 h computed), Project 18 (0 h computed), Project 21 (7.55 h computed), Project 23 (0 h computed).
- Empty timekeep blocks: Project 18, Project 22, Project 23. They contribute 0 h.

## Differences

- Questline excludes cancelled tasks from both counts, so its totals are lower wherever a project has one. Dataview still counts them in `file.tasks` and `fullyCompleted` leaves them incomplete.
- Questline counts a parent task only when every non-cancelled descendant is complete; a cancelled child no longer blocks a finished parent. This vault has no nested tasks in the 28 projects, so no row changes because of it.
- `;` prefixes are display aliases, not separate notes: every project name is shown without the prefix, and all 28 projects resolve a goal through the file name, path, or alias. No `;` alias mismatch remains.
- Missing time is frontmatter-only: the stored totals above have no block to recompute from, so they cannot be verified.
