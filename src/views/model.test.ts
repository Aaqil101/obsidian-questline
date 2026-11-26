import { describe, expect, it } from 'vitest';
import { resolveNote } from '../fields/resolve';
import type {
	GoalNode,
	NoteSnapshot,
	ProjectNode,
	QuestlineIndex,
	TaskItem,
} from '../index/types';
import { DEFAULT_CONFIG } from '../settings/types';
import {
	describeDue,
	formatHours,
	goalDueInfo,
	goalProgressView,
	goalProjectsView,
	projectProgressView,
} from './model';

const NOW = new Date(2026, 0, 1);

const TIMEKEEP = [
	'```timekeep',
	'{"entries":[{"startTime":"2026-01-01T09:00:00Z",' +
		'"endTime":"2026-01-01T11:00:00Z"}]}',
	'```',
].join('\n');

function task(line: number, status: string, parent = -1): TaskItem {
	return { line, parent, status };
}

function snapshot(
	path: string,
	tasks: TaskItem[] = [],
	body = '',
): NoteSnapshot {
	return {
		path,
		mtime: 1,
		fields: resolveNote({ path, frontmatter: {}, body }),
		tasks,
		headings: [],
		body,
	};
}

function goal(
	path: string,
	frontmatter: Record<string, unknown>,
	projectPaths: string[] = [],
): GoalNode {
	return {
		path,
		name: 'Learn Python',
		aliases: [],
		fields: resolveNote({ path, frontmatter, body: '' }),
		projectPaths,
	};
}

function project(
	path: string,
	goalPaths: string | readonly string[] | null = 'goals/Learn.md',
	name = 'Ship the site',
	status: string | null = 'Todo',
): ProjectNode {
	return {
		path,
		name,
		folder: 'projects',
		folderProject: null,
		fields: resolveNote({
			path,
			frontmatter: {
				tags: ['project'],
				...(status === null ? {} : { status }),
			},
			body: '',
		}),
		goalPaths:
			goalPaths === null
				? []
				: typeof goalPaths === 'string'
					? [goalPaths]
					: [...goalPaths],
	};
}
function indexOf(
	goals: GoalNode[],
	projects: ProjectNode[],
	notes: NoteSnapshot[],
): QuestlineIndex {
	return {
		goals,
		projects,
		goalByPath: new Map(goals.map((item) => [item.path, item])),
		projectByPath: new Map(projects.map((item) => [item.path, item])),
		notes: new Map(notes.map((note) => [note.path, note])),
	};
}

describe('goalProgressView', () => {
	it('rolls project tasks into the goal', () => {
		const node = goal(
			'goals/Learn.md',
			{ tags: ['goal'], created: '2025-01-01', timespan: '1 Year' },
			['projects/Site.md'],
		);
		const view = goalProgressView(
			indexOf(
				[node],
				[project('projects/Site.md')],
				[
					snapshot('goals/Learn.md', [task(0, 'x')]),
					snapshot('projects/Site.md', [task(0, 'x'), task(1, ' ')]),
				],
			),
			node,
			DEFAULT_CONFIG,
			NOW,
		);

		expect(view.counts).toEqual({ completed: 2, total: 3, percent: 67 });
		expect(view.projectCount).toBe(1);
		expect(view.empty).toBe(false);
		expect(view.due).toMatchObject({
			dueDate: '2026-01-01',
			remainingDays: 0,
			overdue: false,
		});
		expect(describeDue(view.due)).toBe('Due 2026-01-01 (today)');
	});

	it('counts a linked project only once', () => {
		const node = goal('goals/Learn.md', { tags: ['goal'] }, [
			'projects/Site.md',
			'projects/Site.md',
		]);
		const view = goalProgressView(
			indexOf(
				[node],
				[project('projects/Site.md')],
				[
					snapshot('goals/Learn.md'),
					snapshot('projects/Site.md', [task(0, ' ')]),
				],
			),
			node,
			DEFAULT_CONFIG,
			NOW,
		);

		expect(view.counts.total).toBe(1);
		expect(view.projectCount).toBe(1);
	});

	it('counts a shared project in every linked goal', () => {
		const first = goal('goals/A.md', { tags: ['goal'] }, [
			'projects/Shared.md',
		]);
		const second = goal('goals/B.md', { tags: ['goal'] }, [
			'projects/Shared.md',
		]);
		const index = indexOf(
			[first, second],
			[project('projects/Shared.md', ['goals/A.md', 'goals/B.md'])],
			[
				snapshot('goals/A.md'),
				snapshot('goals/B.md'),
				snapshot('projects/Shared.md', [task(0, 'x'), task(1, ' ')]),
			],
		);

		for (const node of [first, second]) {
			const view = goalProgressView(index, node, DEFAULT_CONFIG, NOW);

			expect(view.counts).toEqual({ completed: 1, total: 2, percent: 50 });
			expect(view.projectCount).toBe(1);
		}
	});

	it('uses manual progress and target when both are present', () => {
		const node = goal('goals/Learn.md', {
			tags: ['goal'],
			progress: 5,
			target: 10,
		});
		const view = goalProgressView(
			indexOf([node], [], [snapshot('goals/Learn.md')]),
			node,
			DEFAULT_CONFIG,
			NOW,
		);

		expect(view.counts).toEqual({ completed: 5, total: 10, percent: 50 });
		expect(view.empty).toBe(false);
	});

	it('is empty with no tasks and no projects', () => {
		const node = goal('goals/Learn.md', { tags: ['goal'] });
		const view = goalProgressView(
			indexOf([node], [], [snapshot('goals/Learn.md')]),
			node,
			DEFAULT_CONFIG,
			NOW,
		);

		expect(view.counts.total).toBe(0);
		expect(view.projectCount).toBe(0);
		expect(view.empty).toBe(true);
	});

	it('ignores manual fields in tasks mode', () => {
		const node = goal('goals/Learn.md', {
			tags: ['goal'],
			progress: 5,
			target: 10,
		});
		const view = goalProgressView(
			indexOf([node], [], [snapshot('goals/Learn.md', [task(0, 'x')])]),
			node,
			{ ...DEFAULT_CONFIG, progressMode: 'tasks' },
			NOW,
		);

		expect(view.counts).toEqual({ completed: 1, total: 1, percent: 100 });
	});

	it('uses only manual fields in manual mode', () => {
		const node = goal('goals/Learn.md', { tags: ['goal'] });
		const withoutManual = goalProgressView(
			indexOf([node], [], [snapshot('goals/Learn.md', [task(0, 'x')])]),
			node,
			{ ...DEFAULT_CONFIG, progressMode: 'manual' },
			NOW,
		);
		expect(withoutManual.counts).toEqual({
			completed: 0,
			total: 0,
			percent: 0,
		});

		const withManual = goal('goals/Learn.md', {
			tags: ['goal'],
			progress: 2,
			target: 4,
		});
		const view = goalProgressView(
			indexOf([withManual], [], [snapshot('goals/Learn.md')]),
			withManual,
			{ ...DEFAULT_CONFIG, progressMode: 'manual' },
			NOW,
		);
		expect(view.counts).toEqual({ completed: 2, total: 4, percent: 50 });
	});
});

describe('goalDueInfo', () => {
	it('treats an infinite span as no due date', () => {
		const due = goalDueInfo('♾Infinite', '2025-01-01', NOW);

		expect(due?.infinite).toBe(true);
		expect(describeDue(due)).toBe('No due date');
	});

	it('reports an overdue goal in whole days', () => {
		const due = goalDueInfo(
			'1 Month',
			'2025-12-15',
			new Date(2026, 0, 20),
		);

		expect(due?.overdue).toBe(true);
		expect(describeDue(due)).toBe('Due 2026-01-15 (5 days overdue)');
	});

	it('leaves an unreadable span without a date', () => {
		const due = goalDueInfo('someday', '2025-01-01', NOW);

		expect(due?.invalid).toBe(true);
		expect(due?.dueDate).toBeNull();
		expect(describeDue(due)).toBe('No due date');
	});

	it('has no due information when the goal sets no timespan', () => {
		expect(goalDueInfo(null, '2025-01-01', NOW)).toBeNull();
		expect(describeDue(null)).toBe('No due date');
	});
});

describe('projectProgressView', () => {
	const goalNode = goal('goals/Learn.md', { tags: ['goal'] });

	it('reads tasks, status, goal, and Timekeep hours', () => {
		const node = project('projects/Site.md');
		const view = projectProgressView(
			indexOf(
				[goalNode],
				[node],
				[
					snapshot('projects/Site.md', [
						task(0, 'x'),
						task(1, ' '),
					], TIMEKEEP),
				],
			),
			node,
			DEFAULT_CONFIG,
			NOW,
		);

		expect(view.counts).toEqual({ completed: 1, total: 2, percent: 50 });
		expect(view.status).toBe('Todo');
		expect(view.goals).toEqual([
			{
				path: 'goals/Learn.md',
				name: 'Learn Python',
			},
		]);
		expect(view.workHours).toBe(2);
		expect(view.empty).toBe(false);
	});

	it('carries every resolved goal', () => {		const node = project('projects/Site.md', [
			'goals/Learn.md',
			'goals/Other.md',
		]);
		const view = projectProgressView(
			indexOf(
				[
					goal('goals/Learn.md', { tags: ['goal'] }),
					goal('goals/Other.md', { tags: ['goal'] }),
				],
				[node],
				[snapshot('projects/Site.md', [task(0, ' ')])],
			),
			node,
			DEFAULT_CONFIG,
			NOW,
		);

		expect(view.goals.map((item) => item.path)).toEqual([
			'goals/Learn.md',
			'goals/Other.md',
		]);
	});

	it('works for a standalone project', () => {
		const node = project('projects/Solo.md', null);
		const view = projectProgressView(
			indexOf([], [node], [snapshot('projects/Solo.md', [task(0, ' ')])]),
			node,
			DEFAULT_CONFIG,
			NOW,
		);

		expect(view.goals).toEqual([]);
		expect(view.counts.total).toBe(1);
	});

	it('is empty without tasks but still reports metadata', () => {
		const node = project('projects/Solo.md', null);
		const view = projectProgressView(
			indexOf([], [node], [snapshot('projects/Solo.md')]),
			node,
			DEFAULT_CONFIG,
			NOW,
		);

		expect(view.empty).toBe(true);
		expect(view.status).toBe('Todo');
		expect(view.workHours).toBe(0);
	});

	it('skips Timekeep when the setting is off', () => {
		const node = project('projects/Solo.md', null);
		const view = projectProgressView(
			indexOf(
				[],
				[node],
				[snapshot('projects/Solo.md', [], TIMEKEEP)],
			),
			node,
			{ ...DEFAULT_CONFIG, useTimekeep: false },
			NOW,
		);

		expect(view.workHours).toBeNull();
	});
});

describe('formatHours', () => {
	it('rounds to two decimals and drops trailing zeros', () => {
		expect(formatHours(2)).toBe('2 h');
		expect(formatHours(19.234)).toBe('19.23 h');
		expect(formatHours(0)).toBe('0 h');
	});
});

describe('goalProjectsView', () => {
	it('lists each project once, in status then name order', () => {
		const node = goal('goals/Learn.md', { tags: ['goal'] }, [
			'projects/Beta.md',
			'projects/Alpha.md',
			'projects/Alpha.md',
			'projects/Gamma.md',
		]);
		const items = goalProjectsView(
			indexOf(
				[node],
				[
					project('projects/Alpha.md', 'goals/Learn.md', 'Alpha', 'In Progress'),
					project('projects/Beta.md', 'goals/Learn.md', 'Beta', 'Todo'),
					project('projects/Gamma.md', 'goals/Learn.md', 'Gamma', null),
				],
				[
					snapshot('projects/Alpha.md', [task(0, 'x'), task(1, ' ')]),
					snapshot('projects/Beta.md', [task(0, 'x')]),
					snapshot('projects/Gamma.md'),
				],
			),
			node,
			DEFAULT_CONFIG,
		);

		expect(items.map((item) => item.name)).toEqual([
			'Beta',
			'Alpha',
			'Gamma',
		]);
		expect(items[0]?.counts).toEqual({
			completed: 1,
			total: 1,
			percent: 100,
		});
		expect(items[1]?.counts.percent).toBe(50);
		expect(items[2]?.status).toBeNull();
	});

	it('is empty when the goal links no projects', () => {
		const node = goal('goals/Learn.md', { tags: ['goal'] });

		expect(
			goalProjectsView(
				indexOf([node], [], [snapshot('goals/Learn.md')]),
				node,
				DEFAULT_CONFIG,
			),
		).toEqual([]);
	});
});
