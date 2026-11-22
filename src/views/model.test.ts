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
import { describeDue, goalDueInfo, goalProgressView } from './model';

const NOW = new Date(2026, 0, 1);

function task(line: number, status: string, parent = -1): TaskItem {
	return { line, parent, status };
}

function snapshot(path: string, tasks: TaskItem[] = []): NoteSnapshot {
	return {
		path,
		mtime: 1,
		fields: resolveNote({ path, frontmatter: {}, body: '' }),
		tasks,
		headings: [],
		body: '',
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

function project(path: string): ProjectNode {
	return {
		path,
		name: 'Ship the site',
		folder: 'projects',
		folderProject: null,
		fields: resolveNote({
			path,
			frontmatter: { tags: ['project'], status: 'Todo' },
			body: '',
		}),
		goalPath: 'goals/Learn.md',
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
