import { describe, expect, it } from 'vitest';
import type { DueInfo } from './model';
import type { GoalOverviewItem } from './overview';
import {
	filterGoals,
	goalCategoryOptions,
	NO_CATEGORY_FILTER,
	sortGoals,
	type GoalFilters,
} from './goal-list';

const CATEGORIES = ['Professional', 'Personal', 'Learning'];

const defaultFilters = (): GoalFilters => ({
	search: '',
	category: '',
	showArchived: false,
});

function due(
	remainingDays: number | null,
	overdue = false,
	infinite = false,
): DueInfo {
	return {
		infinite,
		dueDate: '2026-01-01',
		remainingDays,
		overdue,
		invalid: false,
	};
}

interface ItemOptions {
	category?: string | null;
	percent?: number;
	total?: number;
	archived?: boolean;
	date?: DueInfo | null;
}

function item(
	name: string,
	options: ItemOptions = {},
): GoalOverviewItem {
	return {
		path: `goals/${name}.md`,
		name,
		category: options.category ?? null,
		counts: {
			completed: 0,
			total: options.total ?? 0,
			percent: options.percent ?? 0,
		},
		projectCount: 0,
		due: options.date ?? null,
		progress: null,
		target: null,
		timespan: null,
		reason: null,
		hours: null,
		archived: options.archived ?? false,
	};
}

describe('filterGoals', () => {
	const goals = [
		item('Alpha', { category: 'Professional' }),
		item('Beta', { category: 'personal' }),
		item('Gamma'),
		item('Archived', { category: 'Professional', archived: true }),
	];

	it('hides archived goals by default', () => {
		expect(
			filterGoals(goals, defaultFilters()).map((goal) => goal.name),
		).toEqual(['Alpha', 'Beta', 'Gamma']);
	});

	it('includes archived goals when asked', () => {
		expect(
			filterGoals(goals, {
				...defaultFilters(),
				showArchived: true,
			}).map((goal) => goal.name),
		).toEqual(['Alpha', 'Beta', 'Gamma', 'Archived']);
	});

	it('matches the displayed title case-insensitively', () => {
		expect(
			filterGoals(goals, {
				...defaultFilters(),
				search: ' ALP ',
			}).map((goal) => goal.name),
		).toEqual(['Alpha']);
	});

	it('filters by category case-insensitively', () => {
		expect(
			filterGoals(goals, {
				...defaultFilters(),
				category: 'professional',
			}).map((goal) => goal.name),
		).toEqual(['Alpha']);
	});

	it('filters goals without a category', () => {
		expect(
			filterGoals(goals, {
				...defaultFilters(),
				category: NO_CATEGORY_FILTER,
			}).map((goal) => goal.name),
		).toEqual(['Gamma']);
	});

	it('combines search and category', () => {
		expect(
			filterGoals(goals, {
				...defaultFilters(),
				search: 'arch',
				category: 'Professional',
				showArchived: true,
			}).map((goal) => goal.name),
		).toEqual(['Archived']);
	});
});

describe('sortGoals', () => {
	const goals = [
		item('Zeta', { category: 'Zeta', percent: 20, total: 2 }),
		item('Alpha', { category: 'Personal', percent: 80, total: 5 }),
		item('Beta', { category: 'Professional', percent: 50, total: 1 }),
		item('Gamma', { percent: 10, total: 3 }),
	];

	it('sorts by name in both directions', () => {
		expect(
			sortGoals(goals, 'name', 'asc', CATEGORIES).map(
				(goal) => goal.name,
			),
		).toEqual(['Alpha', 'Beta', 'Gamma', 'Zeta']);
		expect(
			sortGoals(goals, 'name', 'desc', CATEGORIES).map(
				(goal) => goal.name,
			),
		).toEqual(['Zeta', 'Gamma', 'Beta', 'Alpha']);
	});

	it('defaults to configured categories, then unknown, then none', () => {
		expect(
			sortGoals(goals, 'category', 'asc', CATEGORIES).map(
				(goal) => goal.name,
			),
		).toEqual(['Beta', 'Alpha', 'Zeta', 'Gamma']);
	});

	it('sorts by progress and task count', () => {
		expect(
			sortGoals(goals, 'progress', 'asc', CATEGORIES).map(
				(goal) => goal.name,
			),
		).toEqual(['Gamma', 'Zeta', 'Beta', 'Alpha']);
		expect(
			sortGoals(goals, 'tasks', 'desc', CATEGORIES).map(
				(goal) => goal.name,
			),
		).toEqual(['Alpha', 'Gamma', 'Zeta', 'Beta']);
	});

	it('keeps goals without a due date last in both directions', () => {
		const dated = [
			item('Later', { date: due(20) }),
			item('Overdue', { date: due(-3, true) }),
			item('No date'),
			item('Soon', { date: due(2) }),
		];

		expect(
			sortGoals(dated, 'due', 'asc', CATEGORIES).map(
				(goal) => goal.name,
			),
		).toEqual(['Overdue', 'Soon', 'Later', 'No date']);
		expect(
			sortGoals(dated, 'due', 'desc', CATEGORIES).map(
				(goal) => goal.name,
			),
		).toEqual(['Later', 'Soon', 'Overdue', 'No date']);
	});
});

describe('goalCategoryOptions', () => {
	it('lists configured categories, other categories, then none', () => {
		const options = goalCategoryOptions(
			[
				item('Alpha', { category: 'Professional' }),
				item('Beta', { category: 'personal' }),
				item('Gamma', { category: 'Health' }),
				item('Delta'),
			],
			CATEGORIES,
		);

		expect(options.map((option) => option.label)).toEqual([
			'Professional',
			'Personal',
			'Learning',
			'Health',
			'No category',
		]);
		expect(options[options.length - 1]?.value).toBe(NO_CATEGORY_FILTER);
	});
});
