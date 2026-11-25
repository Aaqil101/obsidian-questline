/** Filtering, ordering, and options for the goals view. */
import { categoryRank, type GoalOverviewItem } from './overview';
import { compareText } from './projects';

/** Filter value for goals that have no category. */
export const NO_CATEGORY_FILTER = '__no_category__';

export type GoalSort = 'name' | 'category' | 'progress' | 'tasks' | 'due';
export type GoalSortDirection = 'asc' | 'desc';

export const DEFAULT_GOAL_SORT: GoalSort = 'category';
export const DEFAULT_GOAL_DIRECTION: GoalSortDirection = 'asc';

export const GOAL_SORT_OPTIONS: readonly {
	value: GoalSort;
	label: string;
}[] = [
	{ value: 'category', label: 'Category' },
	{ value: 'name', label: 'Name' },
	{ value: 'progress', label: 'Progress' },
	{ value: 'tasks', label: 'Tasks' },
	{ value: 'due', label: 'Due' },
];

export interface GoalFilters {
	search: string;
	/** A category label, `NO_CATEGORY_FILTER`, or blank for every category. */
	category: string;
	showArchived: boolean;
}

export interface GoalListState extends GoalFilters {
	sort: GoalSort;
	direction: GoalSortDirection;
}

export interface GoalCategoryOption {
	value: string;
	label: string;
}

export function filterGoals(
	goals: readonly GoalOverviewItem[],
	filters: GoalFilters,
): GoalOverviewItem[] {
	const query = filters.search.trim().toLowerCase();
	const category = filters.category.trim();

	return goals.filter((goal) => {
		if (!filters.showArchived && goal.archived) return false;
		if (query && !goal.name.toLowerCase().includes(query)) return false;

		if (category === NO_CATEGORY_FILTER) {
			return goal.category === null;
		}

		if (
			category &&
			(goal.category?.toLowerCase() ?? '') !== category.toLowerCase()
		) {
			return false;
		}

		return true;
	});
}

function dueRank(goal: GoalOverviewItem): number | null {
	if (!goal.due || goal.due.infinite || goal.due.remainingDays === null) {
		return null;
	}

	return goal.due.remainingDays;
}

function compareName(
	left: GoalOverviewItem,
	right: GoalOverviewItem,
): number {
	const name = compareText(left.name, right.name);

	return name !== 0 ? name : compareText(left.path, right.path);
}

export function sortGoals(
	goals: readonly GoalOverviewItem[],
	sort: GoalSort,
	direction: GoalSortDirection,
	categories: readonly string[],
): GoalOverviewItem[] {
	const multiplier = direction === 'desc' ? -1 : 1;

	const compare = (
		left: GoalOverviewItem,
		right: GoalOverviewItem,
	): number => {
		switch (sort) {
			case 'name':
				return compareText(left.name, right.name);
			case 'category': {
				const rank =
					categoryRank(left.category, categories) -
					categoryRank(right.category, categories);
				if (rank !== 0) return rank;

				const category = compareText(
					left.category ?? '',
					right.category ?? '',
				);

				return category !== 0
					? category
					: compareText(left.name, right.name);
			}
			case 'progress':
				return left.counts.percent - right.counts.percent;
			case 'tasks':
				return left.counts.total - right.counts.total;
			default:
				return 0;
		}
	};

	return [...goals].sort((left, right) => {
		if (sort === 'due') {
			const leftDue = dueRank(left);
			const rightDue = dueRank(right);

			if (leftDue === null && rightDue === null) {
				return compareName(left, right);
			}
			if (leftDue === null) return 1;
			if (rightDue === null) return -1;
			if (leftDue !== rightDue) {
				return multiplier * (leftDue - rightDue);
			}

			return compareName(left, right);
		}

		const primary = compare(left, right);
		if (primary !== 0) return multiplier * primary;

		return compareName(left, right);
	});
}

/**
 * Configured categories in their configured order, then any other categories
 * present, then No category.
 */
export function goalCategoryOptions(
	goals: readonly GoalOverviewItem[],
	categories: readonly string[],
): GoalCategoryOption[] {
	const seen = new Set<string>();
	const options: GoalCategoryOption[] = [];

	for (const category of categories) {
		const key = category.toLowerCase();
		if (seen.has(key)) continue;

		seen.add(key);
		options.push({ value: category, label: category });
	}

	const others = new Map<string, string>();

	for (const goal of goals) {
		if (!goal.category) continue;

		const key = goal.category.toLowerCase();
		if (seen.has(key) || others.has(key)) continue;

		others.set(key, goal.category);
	}

	for (const category of [...others.values()].sort(compareText)) {
		options.push({ value: category, label: category });
	}

	options.push({ value: NO_CATEGORY_FILTER, label: 'No category' });

	return options;
}
