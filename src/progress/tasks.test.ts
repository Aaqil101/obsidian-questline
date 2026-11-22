import { describe, expect, it } from 'vitest';
import type { HeadingItem, TaskItem } from '../index/types';
import { ALL_TASKS, buildTaskTree, computeTaskProgress } from './tasks';

function task(line: number, parent: number, status = ' '): TaskItem {
	return { line, parent, status };
}

function bullet(line: number, parent: number): TaskItem {
	return { line, parent };
}

function heading(line: number, text: string, level = 2): HeadingItem {
	return { line, heading: text, level };
}

describe('computeTaskProgress', () => {
	it('counts flat tasks and rounds the percentage', () => {
		const progress = computeTaskProgress({
			tasks: [task(0, -1, 'x'), task(1, -1), task(2, -1)],
		});

		expect(progress).toEqual({ completed: 1, total: 3, percent: 33 });
	});

	it('requires a parent and all descendants to be complete', () => {
		const withOpenChild = computeTaskProgress({
			tasks: [task(0, -1, 'x'), task(1, 0)],
		});
		const allComplete = computeTaskProgress({
			tasks: [task(0, -1, 'x'), task(1, 0, 'x')],
		});

		expect(withOpenChild).toEqual({ completed: 0, total: 2, percent: 0 });
		expect(allComplete).toEqual({ completed: 2, total: 2, percent: 100 });
	});

	it('counts a completed child while its parent stays open', () => {
		const progress = computeTaskProgress({
			tasks: [task(0, -1), task(1, 0, 'x')],
		});

		expect(progress).toEqual({ completed: 1, total: 2, percent: 50 });
	});

	it('excludes cancelled tasks from both counts', () => {
		const progress = computeTaskProgress({
			tasks: [task(0, -1, 'x'), task(1, -1, '-'), task(2, -1)],
		});

		expect(progress).toEqual({ completed: 1, total: 2, percent: 50 });
	});

	it('excludes the subtree of a cancelled task', () => {
		const progress = computeTaskProgress({
			tasks: [task(0, -1, '-'), task(1, 0, 'x')],
		});

		expect(progress).toEqual({ completed: 0, total: 0, percent: 0 });
	});

	it('does not let a cancelled child block a completed parent', () => {
		const progress = computeTaskProgress({
			tasks: [task(0, -1, 'x'), task(1, 0, '-')],
		});

		expect(progress).toEqual({ completed: 1, total: 1, percent: 100 });
	});

	it('treats custom statuses as open', () => {
		const progress = computeTaskProgress({
			tasks: [task(0, -1, '/'), task(1, -1, 'I')],
		});

		expect(progress).toEqual({ completed: 0, total: 2, percent: 0 });
	});

	it('keeps plain bullets in the tree without counting them', () => {
		const progress = computeTaskProgress({
			tasks: [
				bullet(0, -1),
				task(1, 0, 'x'),
				bullet(2, 1),
				task(3, 2, 'x'),
			],
		});

		expect(progress).toEqual({ completed: 2, total: 2, percent: 100 });
	});

	it('returns zero for an empty note', () => {
		expect(computeTaskProgress({ tasks: [] })).toEqual({
			completed: 0,
			total: 0,
			percent: 0,
		});
	});

	it('counts only tasks under the requested heading and its subheadings', () => {
		const source = {
			tasks: [
				task(2, -1, 'x'),
				task(6, -1, 'x'),
				task(7, -1),
				task(11, -1, 'x'),
				task(21, -1, 'x'),
			],
			headings: [
				heading(5, 'Tasks'),
				heading(10, 'Notes'),
				heading(20, 'Subheading', 3),
			],
		};

		expect(computeTaskProgress(source, { type: 'heading', heading: 'Tasks' })).toEqual(
			{ completed: 1, total: 2, percent: 50 },
		);
		expect(
			computeTaskProgress(source, { type: 'heading', heading: 'subheading' }),
		).toEqual({ completed: 1, total: 1, percent: 100 });
	});

	it('returns zero when the scoped heading is missing', () => {
		expect(
			computeTaskProgress(
				{ tasks: [task(0, -1, 'x')], headings: [heading(0, 'Notes')] },
				{ type: 'heading', heading: 'Tasks' },
			),
		).toEqual({ completed: 0, total: 0, percent: 0 });
	});

	it('counts everything when no scope is given', () => {
		const source = {
			tasks: [task(1, -1, 'x'), task(6, -1)],
			headings: [heading(5, 'Tasks')],
		};

		expect(computeTaskProgress(source)).toEqual({
			completed: 1,
			total: 2,
			percent: 50,
		});
		expect(computeTaskProgress(source, ALL_TASKS).total).toBe(2);
	});
});

describe('buildTaskTree', () => {
	it('rebuilds nesting from parent lines', () => {
		const roots = buildTaskTree({
			tasks: [bullet(0, -1), task(1, 0, 'x'), task(2, 1)],
		});

		expect(roots).toHaveLength(1);
		expect(roots[0]).toMatchObject({
			line: 0,
			isTask: false,
			children: [
				{
					line: 1,
					status: 'done',
					isTask: true,
					children: [{ line: 2, status: 'open', isTask: true }],
				},
			],
		});
	});

	it('treats items with a parent outside the scope as roots', () => {
		const roots = buildTaskTree(
			{
				tasks: [bullet(2, -1), task(6, 2, 'x')],
				headings: [heading(5, 'Tasks')],
			},
			{ type: 'heading', heading: 'Tasks' },
		);

		expect(roots).toHaveLength(1);
		expect(roots[0]).toMatchObject({ line: 6, isTask: true });
	});
});
