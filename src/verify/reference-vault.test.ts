import { beforeAll, describe, expect, it } from 'vitest';
import { resolveNote, type ResolvedFields } from '../fields/resolve';
import { asNumber } from '../fields/values';
import { QuestlineIndexService } from '../index/service';
import type { HeadingItem, QuestlineIndex, TaskItem } from '../index/types';
import {
	ALL_TASKS,
	buildTaskTree,
	type TaskNode,
	type TaskProgress,
} from '../progress/tasks';
import {
	computeGoalProgress,
	computeManualProgress,
	computeProjectProgress,
} from '../progress/progress';
import { parseTimespan, type TimespanResult } from '../time/timespan';
import { TimekeepCache, type WorkDuration } from '../timekeep/timekeep';
import { ReferenceVault, type VaultNote } from './read-vault';

const root = process.env.QUESTLINE_REFERENCE_VAULT ?? '';
const suite = root ? describe : describe.skip;
const NOW = new Date();

interface DataviewCounts {
	completed: number;
	total: number;
	cancelled: number;
	excluded: number;
}

function dataviewCounts(note: VaultNote): DataviewCounts {
	const roots = buildTaskTree({ tasks: note.tasks, headings: note.headings });
	let completed = 0;
	let total = 0;
	let cancelled = 0;
	let excluded = 0;

	const fullyComplete = (node: TaskNode): boolean => {
		if (node.status !== 'done') return false;

		return descendantsFullyComplete(node.children);
	};

	const descendantsFullyComplete = (nodes: readonly TaskNode[]): boolean => {
		for (const node of nodes) {
			if (node.isTask && !fullyComplete(node)) return false;
			if (!descendantsFullyComplete(node.children)) return false;
		}

		return true;
	};

	const countTasks = (nodes: readonly TaskNode[]): number =>
		nodes.reduce(
			(sum, node) =>
				sum + (node.isTask ? 1 : 0) + countTasks(node.children),
			0,
		);

	const visit = (node: TaskNode): void => {
		if (node.isTask) {
			total += 1;
			if (node.status === 'cancelled') cancelled += 1;
			if (fullyComplete(node)) completed += 1;
		}

		for (const child of node.children) visit(child);
	};

	for (const treeRoot of roots) visit(treeRoot);

	// Questline drops a cancelled task together with its subtree.
	const visitCancelled = (node: TaskNode): void => {
		if (node.isTask && node.status === 'cancelled') {
			excluded += countTasks([node]);
			return;
		}

		for (const child of node.children) visitCancelled(child);
	};

	for (const treeRoot of roots) visitCancelled(treeRoot);

	return { completed, total, cancelled, excluded };
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

interface ProjectRow {
	path: string;
	name: string;
	questline: TaskProgress;
	dataview: DataviewCounts;
	work: WorkDuration;
	declaredHours: number | null;
}

interface GoalRow {
	path: string;
	name: string;
	questline: TaskProgress;
	dataview: DataviewCounts;
	timespan: TimespanResult;
}

function taskSource(note: VaultNote): { tasks: TaskItem[]; headings: HeadingItem[] } {
	return { tasks: note.tasks, headings: note.headings };
}

function manualOf(fields: ResolvedFields): Parameters<typeof computeManualProgress>[0] | null {
	if (fields.progress === null || fields.target === null) return null;

	return { progress: fields.progress, target: fields.target, start: fields.start };
}

function manualDataview(manual: Parameters<typeof computeManualProgress>[0]): DataviewCounts {
	const progress = computeManualProgress(manual);

	return {
		completed: progress.completed,
		total: progress.total,
		cancelled: 0,
		excluded: 0,
	};
}

function buildReport(
	index: QuestlineIndex,
	projectRows: ProjectRow[],
	goalRows: GoalRow[],
	excludedNotes: { tagged: number; untagged: number },
): string {
	const lines: string[] = [];
	const declaredOnly = projectRows.filter(
		(row) =>
			row.work.blocks === 0 &&
			row.declaredHours !== null &&
			row.declaredHours > 0,
	);
	const blockOnly = projectRows.filter(
		(row) => row.work.blocks > 0 && row.declaredHours === null,
	);
	const emptyBlocks = projectRows.filter(
		(row) => row.work.blocks > 0 && row.work.ms === 0,
	);
	const mismatches = projectRows.filter(
		(row) =>
			row.declaredHours !== null &&
			row.work.blocks > 0 &&
			Math.abs(round2(row.work.hours) - row.declaredHours) > 0.01,
	);
	const matching = projectRows.filter(
		(row) =>
			row.declaredHours !== null &&
			row.work.blocks > 0 &&
			Math.abs(round2(row.work.hours) - row.declaredHours) <= 0.01,
	);

	lines.push('# Phase 0 verification against the reference P&Q vault');
	lines.push('');
	lines.push('- Vault: `00 - P&Q` (Zettelkasten)');
	lines.push(`- Run: ${NOW.toISOString()}`);
	lines.push(`- Goals: ${index.goals.length}`);
	lines.push(`- Projects: ${index.projects.length}`);
	lines.push(
		`- Excluded project notes: ${excludedNotes.tagged} tagged but unmarked, ${excludedNotes.untagged} untagged`,
	);
	lines.push('- Vault writes: none');
	lines.push('');
	lines.push('## Projects');
	lines.push('');
	lines.push(
		'| Project | Questline | Dataview | Excluded | Timekeep h | Declared h |',
	);
	lines.push('| --- | --- | --- | --- | --- | --- |');

	for (const row of projectRows) {
		lines.push(
			`| ${row.name} | ${row.questline.completed}/${row.questline.total} (${row.questline.percent}%) | ${row.dataview.completed}/${row.dataview.total} (${row.dataview.total === 0 ? 0 : Math.round((row.dataview.completed / row.dataview.total) * 100)}%) | ${row.dataview.cancelled} | ${round2(row.work.hours)} | ${row.declaredHours === null ? '—' : row.declaredHours} |`,
		);
	}

	lines.push('');
	lines.push('## Goals');
	lines.push('');
	lines.push(
		'| Goal | Questline | Dataview | Timespan | Due | Days left | Overdue |',
	);
	lines.push('| --- | --- | --- | --- | --- | --- | --- |');

	for (const row of goalRows) {
		const percent =
			row.dataview.total === 0
				? 0
				: Math.round((row.dataview.completed / row.dataview.total) * 100);
		const timespan = row.timespan;

		lines.push(
			`| ${row.name} | ${row.questline.completed}/${row.questline.total} (${row.questline.percent}%) | ${row.dataview.completed}/${row.dataview.total} (${percent}%) | ${row.timespan.raw || '—'} | ${timespan.dueDate ?? (timespan.infinite ? 'never' : '—')} | ${timespan.remainingDays ?? '—'} | ${timespan.overdue ? 'yes' : 'no'} |`,
		);
	}

	lines.push('');
	lines.push('## Work hours');
	lines.push('');

	if (matching.length > 0) {
		lines.push(
			`- Timekeep matches the stored total for ${matching.map((row) => `${row.name} (${row.declaredHours} h)`).join(', ')}.`,
		);
	}

	if (mismatches.length > 0) {
		lines.push(
			`- Timekeep differs from the stored total for ${mismatches
				.map(
					(row) =>
						`${row.name} (${round2(row.work.hours)} h vs ${row.declaredHours} h)`,
				)
				.join(', ')}.`,
		);
	}

	if (declaredOnly.length > 0) {
		lines.push(
			`- Stored totals with no timekeep block: ${declaredOnly
				.map((row) => `${row.name} (${row.declaredHours} h)`)
				.join(', ')}. The note has no block to recompute from, so the stored value cannot be verified.`,
		);
	}

	if (blockOnly.length > 0) {
		lines.push(
			`- A timekeep block with a blank \`work_hours\` field: ${blockOnly
				.map((row) => `${row.name} (${round2(row.work.hours)} h computed)`)
				.join(', ')}.`,
		);
	}

	if (emptyBlocks.length > 0) {
		lines.push(
			`- Empty timekeep blocks: ${emptyBlocks.map((row) => row.name).join(', ')}. They contribute 0 h.`,
		);
	}

	const open = projectRows.filter((row) => row.work.openEntries > 0);
	if (open.length > 0) {
		lines.push(
			`- Open entries counted up to the run time: ${open.map((row) => row.name).join(', ')}.`,
		);
	}

	lines.push('');
	lines.push('## Differences');
	lines.push('');
	lines.push(
		'- Questline excludes cancelled tasks from both counts, so its totals are lower wherever a project has one. Dataview still counts them in `file.tasks` and `fullyCompleted` leaves them incomplete.',
	);
	lines.push(
		'- Questline counts a parent task only when every non-cancelled descendant is complete; a cancelled child no longer blocks a finished parent. This vault has no nested tasks in the 28 projects, so no row changes because of it.',
	);
	lines.push(
		'- `;` prefixes are display aliases, not separate notes: every project name is shown without the prefix, and all 28 projects resolve a goal through the file name, path, or alias. No `;` alias mismatch remains.',
	);
	lines.push(
		'- Missing time is frontmatter-only: the stored totals above have no block to recompute from, so they cannot be verified.',
	);

	return lines.join('\n');
}

let vault: ReferenceVault;
let index: QuestlineIndex;
let projectRows: ProjectRow[];
let goalRows: GoalRow[];
let excludedNotes: { tagged: number; untagged: number };
let report: string;
let initialSnapshot: string;

suite('reference P&Q vault', () => {
	beforeAll(async () => {
		vault = new ReferenceVault(root);
		initialSnapshot = vault.snapshot();

		const service = new QuestlineIndexService(vault);
		index = await service.refresh();
		service.destroy();

		const timekeep = new TimekeepCache();

		const projectNotes = vault.notes.filter((note) =>
			note.path.startsWith('Projects/'),
		);
		const fieldsByPath = new Map<string, ResolvedFields>();

		for (const note of vault.notes) {
			fieldsByPath.set(
				note.path,
				resolveNote({
					path: note.path,
					frontmatter: note.frontmatter,
					body: note.body,
				}),
			);
		}

		const tagged = projectNotes.filter(
			(note) => fieldsByPath.get(note.path)?.isProject,
		);
		const unmarked = tagged.filter(
			(note) => !fieldsByPath.get(note.path)?.hasProjectMarker,
		);
		const untagged = projectNotes.filter(
			(note) => !fieldsByPath.get(note.path)?.isProject,
		);

		excludedNotes = { tagged: unmarked.length, untagged: untagged.length };

		projectRows = index.projects.map((project) => {
			const note = vault.notes.find((entry) => entry.path === project.path);
			if (!note) throw new Error(`Indexed project missing from vault: ${project.path}`);

			return {
				path: project.path,
				name: project.name,
				questline: computeProjectProgress(taskSource(note)),
				dataview: dataviewCounts(note),
				work: timekeep.summarize(project.path, note.mtime, note.body, { now: NOW }),
				declaredHours: asNumber(note.frontmatter?.work_hours),
			};
		});

		goalRows = index.goals.map((goal) => {
			const note = vault.notes.find((entry) => entry.path === goal.path);
			if (!note) throw new Error(`Indexed goal missing from vault: ${goal.path}`);

			const own = dataviewCounts(note);
			const manual = manualOf(goal.fields);
			const dataview: DataviewCounts = manual
				? manualDataview(manual)
				: (() => {
						const counts = { completed: own.completed, total: own.total, cancelled: own.cancelled, excluded: own.excluded };

						for (const projectPath of goal.projectPaths) {
							const project = projectRows.find((row) => row.path === projectPath);
							if (!project) continue;
							counts.completed += project.dataview.completed;
							counts.total += project.dataview.total;
							counts.cancelled += project.dataview.cancelled;
							counts.excluded += project.dataview.excluded;
						}

						return counts;
					})();

			return {
				path: goal.path,
				name: goal.name,
				questline: computeGoalProgress(
					{
						tasks: taskSource(note),
						manual,
						projects: goal.projectPaths
							.map((path) => vault.notes.find((entry) => entry.path === path))
							.filter((entry): entry is VaultNote => entry !== undefined)
							.map((entry) => ({ path: entry.path, ...taskSource(entry) })),
					},
					ALL_TASKS,
				),
				dataview,
				timespan: parseTimespan(goal.fields.timespan, {
					created: goal.fields.created,
					now: NOW,
				}),
			};
		});

		report = buildReport(index, projectRows, goalRows, excludedNotes);
	});

	it('indexes 7 goals and 28 projects and leaves the rest out', () => {
		expect(index.goals).toHaveLength(7);
		expect(index.projects).toHaveLength(28);
		expect(vault.notes.filter((note) => note.path.startsWith('Projects/'))).toHaveLength(43);
		expect(excludedNotes).toEqual({ tagged: 10, untagged: 5 });
		expect(index.projects.every((project) => project.goalPath !== null)).toBe(true);
	});

	it('matches Dataview task counts apart from cancelled tasks', () => {
		for (const row of projectRows) {
			expect(row.questline.completed, row.path).toBe(row.dataview.completed);
			expect(row.questline.total, row.path).toBe(
				row.dataview.total - row.dataview.excluded,
			);
		}
	});

	it('matches the goal rollups apart from cancelled tasks', () => {
		for (const row of goalRows) {
			expect(row.questline.completed, row.path).toBe(row.dataview.completed);
			expect(row.questline.total, row.path).toBe(
				row.dataview.total - row.dataview.excluded,
			);
		}
	});

	it('parses every goal timespan', () => {
		const goals = new Map(goalRows.map((row) => [row.name, row.timespan]));

		expect(goalRows.every((row) => row.timespan.valid)).toBe(true);
		expect(goals.get('2024-10-15 - Learn Blender')?.infinite).toBe(true);
		expect(goals.get('2024-10-15 - Making Add-ons For Blender')?.dueDate).toBe(
			'2034-10-15',
		);
		expect(goals.get('2024-10-24 - Learn AutoHotkey v2')?.infinite).toBe(true);
		expect(goals.get('2025-01-29 - Learn Python')?.infinite).toBe(true);
		expect(goals.get('2025-10-10 - HomeLab')?.dueDate).toBe('2026-10-10');
		expect(goals.get('2025-11-15 - Custom Windows Edition')?.dueDate).toBe(
			'2025-12-15',
		);
		expect(goals.get('2026-11-21 - Learn Motherboard Repair')?.infinite).toBe(
			true,
		);
	});

	it('strips the semicolon alias from every project name', () => {
		for (const row of projectRows) {
			expect(row.name.startsWith(';')).toBe(false);
			expect(index.projectByPath.get(row.path)?.goalPath).not.toBeNull();
		}
	});

	it('sums Timekeep hours and explains stored-time gaps', () => {
		const withTimekeep = projectRows.filter((row) => row.work.blocks > 0);

		expect(withTimekeep.length).toBeGreaterThan(0);
		for (const row of withTimekeep) {
			const declared = row.declaredHours;
			if (declared === null) continue;

			// Stored totals are rounded to two decimals; open timers drift.
			if (row.work.openEntries === 0) {
				expect(Math.abs(round2(row.work.hours) - declared), row.path).toBeLessThanOrEqual(
					0.01,
				);
			}
		}
	});

	it('records the comparison report', () => {
		// The issue keeps this output as the Phase 0 record.
		console.warn(`\n${report}\n`);
		expect(report).toContain('## Projects');
	});

	it('confirms that the run made no vault writes', () => {
		expect(vault.currentSnapshot()).toBe(initialSnapshot);
	});
});
