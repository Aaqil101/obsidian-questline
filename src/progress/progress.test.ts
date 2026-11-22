import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../index/types';
import {
	computeGoalProgress,
	computeManualProgress,
	computeProjectProgress,
} from './progress';

function task(line: number, parent: number, status = ' '): TaskItem {
	return { line, parent, status };
}

describe('computeProjectProgress', () => {
	it('divides completed tasks by total tasks', () => {
		expect(
			computeProjectProgress({
				tasks: [task(0, -1, 'x'), task(1, -1, 'x'), task(2, -1)],
			}),
		).toEqual({ completed: 2, total: 3, percent: 67 });
	});

	it('returns zero for a project with no tasks', () => {
		expect(computeProjectProgress({ tasks: [] })).toEqual({
			completed: 0,
			total: 0,
			percent: 0,
		});
	});
});

describe('computeGoalProgress', () => {
	it('adds the goal tasks to every linked project', () => {
		const progress = computeGoalProgress({
			tasks: { tasks: [task(0, -1, 'x'), task(1, -1)] },
			projects: [
				{ path: 'projects/a.md', tasks: [task(0, -1, 'x')] },
				{ path: 'projects/b.md', tasks: [task(0, -1)] },
			],
		});

		expect(progress).toEqual({ completed: 2, total: 4, percent: 50 });
	});

	it('counts a project linked twice only once', () => {
		const project = { path: 'projects/a.md', tasks: [task(0, -1, 'x')] };

		const progress = computeGoalProgress({
			projects: [project, project, { ...project }],
		});

		expect(progress).toEqual({ completed: 1, total: 1, percent: 100 });
	});

	it('handles a goal with no tasks and no projects', () => {
		expect(computeGoalProgress({})).toEqual({
			completed: 0,
			total: 0,
			percent: 0,
		});
	});

	it('passes the task scope to the goal and its projects', () => {
		const scoped = {
			tasks: [task(2, -1, 'x'), task(11, -1)],
			headings: [
				{ line: 1, heading: 'Tasks', level: 2 },
				{ line: 10, heading: 'Notes', level: 2 },
			],
		};

		expect(computeGoalProgress({ tasks: scoped }, { type: 'heading', heading: 'Tasks' })).toEqual(
			{ completed: 1, total: 1, percent: 100 },
		);
	});

	it('uses manual progress and target when both are present', () => {
		const progress = computeGoalProgress({
			tasks: { tasks: [task(0, -1, 'x')] },
			manual: { progress: 40, target: 100 },
		});

		expect(progress).toEqual({ completed: 40, total: 100, percent: 40 });
	});

	it('falls back to tasks when a manual field is missing', () => {
		const progress = computeGoalProgress({
			tasks: { tasks: [task(0, -1, 'x')] },
			manual: { progress: 40, target: null },
		});

		expect(progress).toEqual({ completed: 1, total: 1, percent: 100 });
	});
});

describe('computeManualProgress', () => {
	it('computes an ascending goal from start to target', () => {
		expect(
			computeManualProgress({ progress: 30, target: 100, start: 10 }),
		).toEqual({ completed: 30, total: 100, percent: 22 });
	});

	it('computes a descending goal from start down to target', () => {
		expect(
			computeManualProgress({ progress: 70, target: 20, start: 90 }),
		).toEqual({ completed: 70, total: 20, percent: 29 });
	});

	it('uses progress over target when no start is set', () => {
		expect(computeManualProgress({ progress: 25, target: 50 })).toEqual({
			completed: 25,
			total: 50,
			percent: 50,
		});
	});

	it('returns zero instead of dividing by zero', () => {
		expect(computeManualProgress({ progress: 0, target: 0 })).toEqual({
			completed: 0,
			total: 0,
			percent: 0,
		});
	});
});
