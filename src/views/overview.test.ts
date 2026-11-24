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
import type { DueInfo } from './model';
import {
	activeGoals,
	attentionItems,
	categoryRank,
	dueUrgency,
	goalOverviewItems,
	groupGoalsByCategory,
	inProgressProjects,
	overviewStats,
	projectOverviewItems,
	type GoalOverviewItem,
	type ProjectOverviewItem,
} from './overview';

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
	name: string,
	frontmatter: Record<string, unknown>,
	projectPaths: string[] = [],
): GoalNode {
	const fields = resolveNote({
		path,
		frontmatter: { tags: ['goal'], ...frontmatter },
		body: '',
	});

	return {
		path,
		name,
		aliases: fields.aliases,
		fields,
		projectPaths,
	};
}

function project(
	path: string,
	name: string,
	status: string | null,
	goalPath: string | null = null,
	extra: Record<string, unknown> = {},
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
				...extra,
			},
			body: '',
		}),
		goalPath,
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

describe('categoryRank', () => {
	const categories = ['Professional', 'Personal', 'Learning'];

	it('uses the configured order, case-insensitively', () => {
		expect(categoryRank('personal', categories)).toBe(1);
		expect(categoryRank('LEARNING', categories)).toBe(2);
	});

	it('puts unknown categories before no category', () => {
		expect(categoryRank('Unknown', categories)).toBe(3);
		expect(categoryRank(null, categories)).toBe(4);
	});
});

describe('dueUrgency', () => {
	const due = (
		remainingDays: number | null,
		overdue = false,
		infinite = false,
	): DueInfo => ({
		infinite,
		dueDate: '2026-01-01',
		remainingDays,
		overdue,
		invalid: false,
	});

	it('classifies overdue, today, soon, and later dates', () => {
		expect(dueUrgency(due(-2, true))).toBe('overdue');
		expect(dueUrgency(due(0))).toBe('today');
		expect(dueUrgency(due(3))).toBe('soon');
		expect(dueUrgency(due(7))).toBe('soon');
		expect(dueUrgency(due(8))).toBe('later');
	});

	it('has no urgency without a date', () => {
		expect(dueUrgency(null)).toBe('none');
		expect(dueUrgency(due(null, false, true))).toBe('none');
	});
});

describe('groupGoalsByCategory', () => {
	const goal = (
		name: string,
		category: string | null,
	): GoalOverviewItem => ({
		path: `goals/${name}.md`,
		name,
		category,
		counts: { completed: 0, total: 0, percent: 0 },
		projectCount: 0,
		due: null,
		hours: null,
		archived: false,
	});

	it('keeps the sorted order and splits when the category changes', () => {
		const groups = groupGoalsByCategory([
			goal('Alpha', 'Personal'),
			goal('Beta', 'personal'),
			goal('Gamma', 'Learning'),
			goal('Delta', null),
		]);

		expect(
			groups.map((group) => [
				group.category,
				group.goals.map((item) => item.name),
			]),
		).toEqual([
			['Personal', ['Alpha', 'Beta']],
			['Learning', ['Gamma']],
			[null, ['Delta']],
		]);
	});
});

describe('goalOverviewItems', () => {
	const goals = [
		goal('goals/Alpha.md', 'Alpha', { category: 'Personal' }),
		goal('goals/Beta.md', 'Beta', { category: 'professional' }),
		goal('goals/Gamma.md', 'Gamma', { category: 'Zeta' }),
		goal('goals/Delta.md', 'Delta', { category: 'Alpha' }),
		goal('goals/Epsilon.md', 'Epsilon', {}),
		goal('goals/Archived.md', 'Archived', {
			category: 'Personal',
			type: 'Archive',
		}),
	];

	const index = indexOf(
		goals,
		[],
		goals.map((node) => snapshot(node.path)),
	);

	it('orders configured categories, then unknown ones, then no category', () => {
		const items = goalOverviewItems(index, DEFAULT_CONFIG, NOW);

		expect(items.map((item) => item.name)).toEqual([
			'Beta',
			'Alpha',
			'Archived',
			'Delta',
			'Gamma',
			'Epsilon',
		]);
	});

	it('marks archived goals without dropping them', () => {
		const items = goalOverviewItems(index, DEFAULT_CONFIG, NOW);
		const archived = items.filter((item) => item.archived);

		expect(archived.map((item) => item.name)).toEqual(['Archived']);
		expect(activeGoals(items).map((item) => item.name)).not.toContain(
			'Archived',
		);
	});

	it('uses the alias as the display name', () => {
		const aliased = goal(
			'goals/Learn.md',
			'2025-01-01 - Learn',
			{ aliases: ['Learn Python'] },
		);
		const [item] = goalOverviewItems(
			indexOf([aliased], [], [snapshot(aliased.path)]),
			DEFAULT_CONFIG,
			NOW,
		);

		expect(item?.name).toBe('Learn Python');
	});

	it('rolls linked project tasks into the goal', () => {
		const node = goal(
			'goals/Learn.md',
			'Learn',
			{ category: 'Learning' },
			['projects/Site.md'],
		);
		const [item] = goalOverviewItems(
			indexOf(
				[node],
				[project('projects/Site.md', 'Site', 'In Progress', node.path)],
				[
					snapshot(node.path),
					snapshot('projects/Site.md', [
						task(0, 'x'),
						task(1, ' '),
					]),
				],
			),
			DEFAULT_CONFIG,
			NOW,
		);

		expect(item?.counts).toEqual({
			completed: 1,
			total: 2,
			percent: 50,
		});
		expect(item?.projectCount).toBe(1);
		expect(item?.category).toBe('Learning');
	});

	it('rolls linked project hours up to the goal', () => {
		const node = goal('goals/Learn.md', 'Learn', {}, [
			'projects/Site.md',
		]);
		const index = indexOf(
			[node],
			[project('projects/Site.md', 'Site', 'In Progress', node.path)],
			[
				snapshot(node.path),
				snapshot('projects/Site.md', [task(0, 'x')], TIMEKEEP),
			],
		);

		expect(goalOverviewItems(index, DEFAULT_CONFIG, NOW)[0]?.hours).toBe(2);
		expect(
			goalOverviewItems(
				index,
				{ ...DEFAULT_CONFIG, useTimekeep: false },
				NOW,
			)[0]?.hours,
		).toBeNull();
		expect(
			goalOverviewItems(
				index,
				DEFAULT_CONFIG,
				NOW,
				new Map([['projects/Site.md', 5]]),
			)[0]?.hours,
		).toBe(5);
	});
});

describe('projectOverviewItems', () => {
	const goals = [goal('goals/Alpha.md', 'Alpha', {})];
	const projects = [
		project('projects/Zeta.md', 'Zeta', 'In Progress', 'goals/Alpha.md'),
		project('projects/alpha.md', 'Alpha', 'Completed'),
		project('projects/Middle.md', 'Middle', null),
	];
	const index = indexOf(goals, projects, [
		snapshot('goals/Alpha.md'),
		snapshot('projects/Zeta.md', [task(0, 'x'), task(1, ' ')], TIMEKEEP),
		snapshot('projects/alpha.md', [task(0, 'x'), task(1, 'x')]),
		snapshot('projects/Middle.md'),
	]);

	it('lists every status in name order', () => {
		const items = projectOverviewItems(index, DEFAULT_CONFIG, NOW);

		expect(items.map((item) => item.name)).toEqual([
			'Alpha',
			'Middle',
			'Zeta',
		]);
		expect(items.map((item) => item.status)).toEqual([
			'Completed',
			null,
			'In Progress',
		]);
	});

	it('carries the goal link and tracked hours', () => {
		const items = projectOverviewItems(index, DEFAULT_CONFIG, NOW);
		const zeta = items.find((item) => item.name === 'Zeta');

		expect(zeta?.goal).toEqual({
			path: 'goals/Alpha.md',
			name: 'Alpha',
		});
		expect(zeta?.hours).toBe(2);
		expect(items.find((item) => item.name === 'Alpha')?.goal).toBeNull();
	});

	it('drops hours when Timekeep is off', () => {
		const items = projectOverviewItems(
			index,
			{ ...DEFAULT_CONFIG, useTimekeep: false },
			NOW,
		);

		expect(items.every((item) => item.hours === null)).toBe(true);
	});

	it('carries the subtitle and authors', () => {
		const node = project(
			'projects/Extra.md',
			'Extra',
			'In Progress',
			null,
			{ subtitle: 'Ship it', authors: ['Aaqil'] },
		);
		const [item] = projectOverviewItems(
			indexOf([], [node], [snapshot(node.path)]),
			DEFAULT_CONFIG,
			NOW,
		);

		expect(item?.subtitle).toBe('Ship it');
		expect(item?.authors).toEqual(['Aaqil']);
	});
});

describe('inProgressProjects', () => {
	it('matches the status case-insensitively and keeps order', () => {
		const item = (
			name: string,
			status: string | null,
		): ProjectOverviewItem => ({
			path: `projects/${name}.md`,
			name,
			subtitle: null,
			authors: [],
			status,
			counts: { completed: 0, total: 0, percent: 0 },
			goal: null,
			hours: null,
		});
		const items = [
			item('Alpha', 'In Progress'),
			item('Beta', 'Todo'),
			item('Gamma', 'in progress'),
			item('Delta', null),
			item('Epsilon', 'Completed'),
		];

		expect(
			inProgressProjects(items).map((entry) => entry.name),
		).toEqual(['Alpha', 'Gamma']);
	});
});

describe('attentionItems', () => {
	it('lists overdue goals and in-progress work that needs a goal or tasks', () => {
		const overdue = goal('goals/Overdue.md', 'Overdue', {
			created: '2025-11-15',
			timespan: '1 Month',
		});
		const later = goal('goals/Later.md', 'Later', {
			created: '2025-12-30',
			timespan: '1 Year',
		});
		const archived = goal('goals/Archived.md', 'Archived', {
			created: '2025-11-15',
			timespan: '1 Month',
			type: 'Archive',
		});
		const noGoal = project(
			'projects/No Goal.md',
			'No Goal',
			'In Progress',
		);
		const noTasks = project(
			'projects/No Tasks.md',
			'No Tasks',
			'In Progress',
			'goals/Later.md',
		);
		const withTasks = project(
			'projects/With Tasks.md',
			'With Tasks',
			'In Progress',
			'goals/Later.md',
		);
		const completed = project(
			'projects/Done.md',
			'Done',
			'Completed',
		);
		const goals = [overdue, later, archived];
		const index = indexOf(
			goals,
			[noGoal, noTasks, withTasks, completed],
			[
				snapshot(overdue.path),
				snapshot(later.path),
				snapshot(archived.path),
				snapshot(noGoal.path),
				snapshot(noTasks.path),
				snapshot(withTasks.path, [task(0, ' ')]),
				snapshot(completed.path),
			],
		);
		const items = attentionItems(
			goalOverviewItems(index, DEFAULT_CONFIG, NOW),
			projectOverviewItems(index, DEFAULT_CONFIG, NOW),
		);

		expect(
			items.map((item) => [item.kind, item.name, item.detail]),
		).toEqual([
			['overdue-goal', 'Overdue', 'Overdue by 17 days'],
			['project-no-goal', 'No Goal', 'No goal linked'],
			['project-no-tasks', 'No Tasks', 'No tasks yet'],
		]);
	});

	it('is empty when nothing needs attention', () => {
		const fine = goal('goals/Fine.md', 'Fine', {
			created: '2025-12-30',
			timespan: '1 Year',
		});
		const busy = project(
			'projects/Busy.md',
			'Busy',
			'In Progress',
			'goals/Fine.md',
		);
		const index = indexOf(
			[fine],
			[busy],
			[snapshot(fine.path), snapshot(busy.path, [task(0, ' ')])],
		);

		expect(
			attentionItems(
				goalOverviewItems(index, DEFAULT_CONFIG, NOW),
				projectOverviewItems(index, DEFAULT_CONFIG, NOW),
			),
		).toEqual([]);
	});
});

describe('overviewStats', () => {
	it('counts active goals, project statuses, and the average progress', () => {
		const goals = [
			goal('goals/Alpha.md', 'Alpha', { category: 'Personal' }),
			goal('goals/Archive.md', 'Archive', { type: 'Archive' }),
		];
		const projects = [
			project('projects/One.md', 'One', 'In Progress'),
			project('projects/Two.md', 'Two', 'Completed'),
			project('projects/Three.md', 'Three', 'Todo'),
		];
		const index = indexOf(goals, projects, [
			snapshot('goals/Alpha.md'),
			snapshot('goals/Archive.md'),
			snapshot('projects/One.md', [task(0, 'x'), task(1, ' ')]),
			snapshot('projects/Two.md', [task(0, 'x')]),
			snapshot('projects/Three.md', [task(0, ' ')]),
		]);
		const stats = overviewStats(
			goalOverviewItems(index, DEFAULT_CONFIG, NOW),
			projectOverviewItems(index, DEFAULT_CONFIG, NOW),
			DEFAULT_CONFIG,
		);

		expect(stats).toEqual([
			{ label: 'Goals', value: '1' },
			{ label: 'Projects', value: '3' },
			{ label: 'In progress', value: '1' },
			{ label: 'Completed', value: '1' },
			{ label: 'Avg progress', value: '50%' },
			{ label: 'Tracked time', value: '0.00h' },
		]);
	});

	it('omits tracked time when Timekeep is off', () => {
		const stats = overviewStats([], [], {
			...DEFAULT_CONFIG,
			useTimekeep: false,
		});

		expect(stats.map((stat) => stat.label)).toEqual([
			'Goals',
			'Projects',
			'In progress',
			'Completed',
			'Avg progress',
		]);
		expect(stats.find((stat) => stat.label === 'Avg progress')?.value).toBe(
			'0%',
		);
	});
});
