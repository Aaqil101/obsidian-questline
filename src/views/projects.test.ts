import { describe, expect, it } from 'vitest';
import type { GoalProjectItem } from './model';
import {
	dashboardStats,
	filterGoalProjects,
	formatTrackedHours,
	NO_STATUS_FILTER,
	sortGoalProjects,
	type ProjectSort,
} from './projects';

function item(
	name: string,
	status: string | null,
	percent: number,
	total: number,
	authors: string[] = [],
	hours: number | null = 0,
): GoalProjectItem {
	return {
		path: `projects/${name}.md`,
		name,
		status,
		counts: { completed: total === 0 ? 0 : 1, total, percent },
		authors,
		hours,
	};
}

const ITEMS = [
	item('Beta', 'Todo', 20, 5, ['Aaqil'], 1.5),
	item('Alpha', 'In Progress', 60, 5, ['Sam'], 0.5),
	item('Gamma', 'Completed', 100, 3, [], null),
];

describe('filterGoalProjects', () => {
	it('filters by name', () => {
		expect(
			filterGoalProjects(ITEMS, {
				search: 'alp',
				status: '',
				author: '',
			}).map((entry) => entry.name),
		).toEqual(['Alpha']);
	});

	it('filters by status, ignoring case', () => {
		expect(
			filterGoalProjects(ITEMS, {
				search: '',
				status: 'in progress',
				author: '',
			}).map((entry) => entry.name),
		).toEqual(['Alpha']);
	});

	it('filters projects without a status', () => {
		const none = item('No status', null, 0, 0);

		expect(
			filterGoalProjects([...ITEMS, none], {
				search: '',
				status: NO_STATUS_FILTER,
				author: '',
			}).map((entry) => entry.name),
		).toEqual(['No status']);
	});

	it('filters by one author on a multi-author project', () => {
		const shared = item('Shared', 'Todo', 0, 0, ['Aaqil', 'Sam']);

		expect(
			filterGoalProjects([shared], {
				search: '',
				status: '',
				author: 'sam',
			}),
		).toHaveLength(1);
	});

	it('groups projects without authors under None', () => {
		expect(
			filterGoalProjects(ITEMS, {
				search: '',
				status: '',
				author: 'None',
			}).map((entry) => entry.name),
		).toEqual(['Gamma']);
	});
});

describe('sortGoalProjects', () => {
	const statuses = ['Todo', 'In Progress', 'Completed'];

	function names(sort: ProjectSort, direction: 'asc' | 'desc' = 'asc') {
		return sortGoalProjects(ITEMS, sort, direction, statuses).map(
			(entry) => entry.name,
		);
	}

	it('sorts by name in both directions', () => {
		expect(names('name')).toEqual(['Alpha', 'Beta', 'Gamma']);
		expect(names('name', 'desc')).toEqual(['Gamma', 'Beta', 'Alpha']);
	});

	it('sorts by the configured status order', () => {
		expect(names('status')).toEqual(['Beta', 'Alpha', 'Gamma']);
	});

	it('sorts by progress, tasks, author, and hours', () => {
		expect(names('progress')).toEqual(['Beta', 'Alpha', 'Gamma']);
		expect(names('tasks')).toEqual(['Gamma', 'Alpha', 'Beta']);
		expect(names('author')).toEqual(['Beta', 'Gamma', 'Alpha']);
		expect(names('hours')).toEqual(['Gamma', 'Alpha', 'Beta']);
	});
});

describe('formatTrackedHours', () => {
	it('formats decimal and readable time', () => {
		expect(formatTrackedHours(2.5, 'decimal')).toBe('2.50h');
		expect(formatTrackedHours(2.5, 'readable')).toBe('2h 30m');
		expect(formatTrackedHours(0.5, 'readable')).toBe('30m');
		expect(formatTrackedHours(2, 'readable')).toBe('2h');
		expect(formatTrackedHours(0, 'readable')).toBe('0h');
	});
});

describe('dashboardStats', () => {
	it('reports totals, status counts, average, and hours', () => {
		expect(dashboardStats(ITEMS, true, 'decimal')).toEqual([
			{ label: 'Total Projects', value: '3' },
			{ label: 'In Progress', value: '1' },
			{ label: 'Completed', value: '1' },
			{ label: 'Avg Progress', value: '60%' },
			{ label: 'Total Hours', value: '2.00h' },
		]);
	});

	it('omits hours when Timekeep is off', () => {
		expect(dashboardStats(ITEMS, false, 'decimal')).toHaveLength(4);
	});
});
