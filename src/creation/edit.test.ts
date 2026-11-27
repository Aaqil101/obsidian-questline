import { describe, expect, it } from 'vitest';
import type { ResolvedFields } from '../fields/resolve';
import type { GoalNode, ProjectNode } from '../index/types';
import {
	applyGoalEdit,
	applyProjectEdit,
	goalEditDraft,
	parseAuthors,
	planRename,
	projectEditDraft,
	projectGoalNodes,
	unresolvedGoalCount,
} from './edit';

function fields(overrides: Partial<ResolvedFields> = {}): ResolvedFields {
	return {
		path: '',
		tags: [],
		isGoal: false,
		isProject: false,
		hasProjectMarker: false,
		category: null,
		status: null,
		noteType: null,
		goals: [],
		projectTemplate: null,
		timespan: null,
		reason: null,
		authors: [],
		subtitle: null,
		projectClass: null,
		created: null,
		aliases: [],
		progress: null,
		target: null,
		start: null,
		...overrides,
	};
}

function goal(
	path: string,
	name: string,
	overrides: Partial<ResolvedFields> = {},
	aliases: string[] = [],
): GoalNode {
	return {
		path,
		name,
		aliases,
		fields: fields({ path, ...overrides }),
		projectPaths: [],
	};
}

function project(
	path: string,
	name: string,
	overrides: Partial<ResolvedFields> = {},
	goalPaths: string[] = [],
): ProjectNode {
	return {
		path,
		name,
		folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
		folderProject: null,
		fields: fields({ path, ...overrides }),
		goalPaths,
	};
}

describe('goalEditDraft', () => {
	it('prefills from the first alias and the goal fields', () => {
		const draft = goalEditDraft(
			goal(
				'goals/2026-01-01 - Learn.md',
				'2026-01-01 - Learn',
				{
					category: 'Knowledge',
					reason: 'Grow',
					timespan: '6 Months',
				},
				['Learn Python'],
			),
		);

		expect(draft).toEqual({
			title: 'Learn Python',
			category: 'Knowledge',
			reason: 'Grow',
			timespan: '6 Months',
		});
	});

	it('falls back to the filename without a date prefix', () => {
		expect(goalEditDraft(goal('goals/2026-01-01 - Learn.md', '2026-01-01 - Learn')).title).toBe(
			'Learn',
		);
	});
});

describe('projectEditDraft', () => {
	it('prefills details and selected goals', () => {
		const alpha = goal('goals/Alpha.md', 'Alpha', {}, ['A']);
		const beta = goal('goals/Beta.md', 'Beta');
		const item = project(
			'projects/site.md',
			'Site',
			{
				status: 'In Progress',
				authors: ['Aaqil', 'Sam'],
				subtitle: 'Ship it',
			},
			['goals/Alpha.md', 'goals/Beta.md'],
		);

		const selected = projectGoalNodes(
			item,
			new Map([
				[alpha.path, alpha],
				[beta.path, beta],
			]),
		);

		expect(projectEditDraft(item, selected)).toEqual({
			title: 'Site',
			goals: [
				{ path: 'goals/Alpha.md', name: 'Alpha', display: 'A' },
				{ path: 'goals/Beta.md', name: 'Beta', display: undefined },
			],
			status: 'In Progress',
			author: 'Aaqil, Sam',
			subtitle: 'Ship it',
		});
	});
});

describe('parseAuthors', () => {
	it('splits, trims, and removes duplicates', () => {
		expect(parseAuthors(' Aaqil, sam, AAQIL, , ')).toEqual(['Aaqil', 'sam']);
	});
});

describe('applyGoalEdit', () => {
	it('updates values and keeps the existing alias key casing', () => {
		const frontmatter: Record<string, unknown> = {
			Aliases: ['Old', 'Keep me'],
			Category: 'Old',
			reason: 'Old',
			timespan: '1 Month',
		};

		applyGoalEdit(frontmatter, {
			title: 'New',
			category: 'Life',
			reason: 'New reason',
			timespan: '',
		});

		expect(frontmatter).toEqual({
			Aliases: ['New', 'Keep me'],
			Category: 'Life',
			reason: 'New reason',
		});
	});
});

describe('applyProjectEdit', () => {
	it('writes one goal as a string and several as an array', () => {
		const one: Record<string, unknown> = { status: 'Todo' };
		applyProjectEdit(one, {
			title: 'One',
			goals: [{ path: 'Alpha.md', name: 'Alpha' }],
			status: 'Done',
			author: '',
			subtitle: '',
		});
		expect(one.goal).toBe('[[Alpha]]');

		const many: Record<string, unknown> = {};
		applyProjectEdit(many, {
			title: 'Many',
			goals: [
				{ path: 'Alpha.md', name: 'Alpha' },
				{ path: 'Beta.md', name: 'Beta' },
			],
			status: 'Done',
			author: 'Aaqil, Sam',
			subtitle: 'Ship',
		});
		expect(many.goal).toEqual(['[[Alpha]]', '[[Beta]]']);
		expect(many.author).toEqual(['Aaqil', 'Sam']);
		expect(many.subtitle).toBe('Ship');
	});

	it('removes goal, author, and subtitle when cleared', () => {
		const frontmatter: Record<string, unknown> = {
			goal: '[[Alpha]]',
			Author: 'Aaqil',
			subtitle: 'Old',
		};

		applyProjectEdit(frontmatter, {
			title: 'Project',
			goals: [],
			status: 'Todo',
			author: '',
			subtitle: '',
		});

		expect(frontmatter).toEqual({
			aliases: ['Project'],
			status: 'Todo',
		});
	});

	it('preserves an existing author key case', () => {
		const frontmatter: Record<string, unknown> = { Author: 'Old' };

		applyProjectEdit(frontmatter, {
			title: 'Project',
			goals: [],
			status: 'Todo',
			author: 'New',
			subtitle: '',
		});

		expect(frontmatter.Author).toBe('New');
	});
});

describe('planRename', () => {
	const free = (): boolean => false;

	it('drops the date prefix and keeps the note folder', () => {
		expect(
			planRename('goals/2026-01-01 - Old.md', 'Old', 'New name', free),
		).toEqual({
			requestedPath: 'goals/New name.md',
			path: 'goals/New name.md',
		});
	});

	it('renames inside a folder-style project folder', () => {
		expect(
			planRename('projects/Site/Site.md', 'Site', 'Website', free),
		).toEqual({
			requestedPath: 'projects/Site/Website.md',
			path: 'projects/Site/Website.md',
		});
	});

	it('does nothing when the sanitized title matches the current path', () => {
		expect(planRename('goals/Alpha.md', 'Alpha', 'Alpha', free)).toBeNull();
	});

	it('does nothing when the title text is unchanged', () => {
		expect(
			planRename(
				'goals/2026-01-01 - Learn.md',
				'Learn',
				'Learn',
				free,
			),
		).toBeNull();
	});

	it('adds a suffix when the requested path is taken', () => {
		const plan = planRename(
			'goals/Alpha.md',
			'Alpha',
			'Beta',
			(path) => path === 'goals/Beta.md',
		);

		expect(plan?.requestedPath).toBe('goals/Beta.md');
		expect(plan?.path).toBe('goals/Beta 2.md');
	});
});

describe('unresolvedGoalCount', () => {
	it('counts links that no longer resolve', () => {
		const alpha = goal('goals/Alpha.md', 'Alpha', {}, ['A']);
		const item = project(
			'projects/Site.md',
			'Site',
			{
				goals: [
					{ target: 'Alpha', display: null, heading: null },
					{ target: 'Missing', display: null, heading: null },
					{ target: 'A', display: null, heading: null },
				],
			},
			['goals/Alpha.md'],
		);

		expect(unresolvedGoalCount(item, [alpha])).toBe(1);
	});
});
