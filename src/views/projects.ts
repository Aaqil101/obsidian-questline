/** Filtering, sorting, and display helpers for the goal-projects block. */
import type { TrackedTimeFormat } from '../settings/types';
import type { GoalProjectItem } from './model';

export type ProjectSort =
	| 'name'
	| 'author'
	| 'progress'
	| 'status'
	| 'tasks'
	| 'hours';

export type ProjectDirection = 'asc' | 'desc';
export type TimeFormat = TrackedTimeFormat;

export interface ProjectFilters {
	search: string;
	/** An exact status label, or `NO_STATUS_FILTER`; blank means every status. */
	status: string;
	/** An exact author name, or `None`; blank means every author. */
	author: string;
}

export interface ProjectListState extends ProjectFilters {
	sort: ProjectSort;
	direction: ProjectDirection;
}

export interface ProjectOption {
	value: string;
	label: string;
}

/** Filter value for projects that are indexed without a status. */
export const NO_STATUS_FILTER = '__no_status__';

export const DEFAULT_PROJECT_SORT: ProjectSort = 'status';
export const DEFAULT_PROJECT_DIRECTION: ProjectDirection = 'asc';

export const DEFAULT_PROJECT_LIST_STATE: ProjectListState = {
	search: '',
	status: '',
	author: '',
	sort: DEFAULT_PROJECT_SORT,
	direction: DEFAULT_PROJECT_DIRECTION,
};

export const PROJECT_SORT_OPTIONS: readonly {
	value: ProjectSort;
	label: string;
}[] = [
	{ value: 'name', label: 'Name' },
	{ value: 'author', label: 'Author' },
	{ value: 'progress', label: 'Progress' },
	{ value: 'status', label: 'Status' },
	{ value: 'tasks', label: 'Tasks' },
	{ value: 'hours', label: 'Hours' },
];

/** Deterministic, locale-independent text order. */
export function compareText(left: string, right: string): number {
	const a = left.toLowerCase();
	const b = right.toLowerCase();

	if (a < b) return -1;
	if (a > b) return 1;

	return 0;
}

/** Configured status order first, then unknown statuses, then no status. */
export function statusRank(
	status: string | null,
	statuses: readonly string[],
): number {
	if (status === null) return statuses.length + 1;

	const found = statuses.findIndex(
		(value) => value.toLowerCase() === status.toLowerCase(),
	);

	return found < 0 ? statuses.length : found;
}

/** All authors on one line, for sorting and the dashboard column. */
export function projectAuthor(item: GoalProjectItem): string {
	return item.authors.join(', ') || 'None';
}

/** Apply the search, status, and author filters. */
export function filterGoalProjects<T extends GoalProjectItem>(
	items: readonly T[],
	filters: ProjectFilters,
): T[] {
	const query = filters.search.trim().toLowerCase();
	const status = filters.status.trim();
	const author = filters.author.trim().toLowerCase();

	return items.filter((item) => {
		if (query && !item.name.toLowerCase().includes(query)) return false;

		if (status === NO_STATUS_FILTER) {
			if (item.status !== null) return false;
		} else if (
			status &&
			(item.status?.toLowerCase() ?? '') !== status.toLowerCase()
		) {
			return false;
		}

		if (author === 'none') {
			if (item.authors.length > 0) return false;
		} else if (
			author &&
			!item.authors.some((name) => name.toLowerCase() === author)
		) {
			return false;
		}

		return true;
	});
}

/** Configured statuses first, then any other statuses present, then no status. */
export function statusOptions(
	items: readonly GoalProjectItem[],
	statuses: readonly string[],
): ProjectOption[] {
	const seen = new Map<string, string>();

	for (const status of statuses) {
		const key = status.toLowerCase();
		if (!seen.has(key)) seen.set(key, status);
	}

	for (const item of items) {
		if (!item.status) continue;

		const key = item.status.toLowerCase();
		if (!seen.has(key)) seen.set(key, item.status);
	}

	const options = [...seen.values()].map((status) => ({
		value: status,
		label: status,
	}));

	if (items.some((item) => item.status === null)) {
		options.push({ value: NO_STATUS_FILTER, label: 'No status' });
	}

	return options;
}

/** Every indexed author in text order, then None when a project has none. */
export function authorOptions(
	items: readonly GoalProjectItem[],
): ProjectOption[] {
	const seen = new Map<string, string>();

	for (const item of items) {
		for (const author of item.authors) {
			const key = author.toLowerCase();
			if (!seen.has(key)) seen.set(key, author);
		}
	}

	const options = [...seen.values()]
		.sort(compareText)
		.map((author) => ({ value: author, label: author }));

	if (items.some((item) => item.authors.length === 0)) {
		options.push({ value: 'None', label: 'None' });
	}

	return options;
}

/** Sort a filtered list by one column, with the name as a stable tie-break. */
export function sortGoalProjects<T extends GoalProjectItem>(
	items: readonly T[],
	sort: ProjectSort,
	direction: ProjectDirection,
	statuses: readonly string[],
): T[] {
	const multiplier = direction === 'desc' ? -1 : 1;

	const compare = (left: GoalProjectItem, right: GoalProjectItem): number => {
		switch (sort) {
			case 'author':
				return compareText(projectAuthor(left), projectAuthor(right));
			case 'progress':
				return left.counts.percent - right.counts.percent;
			case 'status':
				return (
					statusRank(left.status, statuses) -
					statusRank(right.status, statuses)
				);
			case 'tasks':
				return left.counts.total - right.counts.total;
			case 'hours':
				return (left.hours ?? 0) - (right.hours ?? 0);
			default:
				return compareText(left.name, right.name);
		}
	};

	return [...items].sort((left, right) => {
		const primary = compare(left, right);
		if (primary !== 0) return multiplier * primary;

		const name = compareText(left.name, right.name);
		if (name !== 0) return name;

		return compareText(left.path, right.path);
	});
}

/** Decimal (`2.50h`) or readable (`2h 30m`) tracked time. */
export function formatTrackedHours(
	hours: number,
	format: TimeFormat,
): string {
	if (format === 'decimal') return `${hours.toFixed(2)}h`;

	const totalMinutes = Math.round(hours * 60);
	if (totalMinutes === 0) return '0h';

	const wholeHours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (wholeHours === 0) return `${minutes}m`;
	if (minutes === 0) return `${wholeHours}h`;

	return `${wholeHours}h ${minutes}m`;
}

export interface DashboardStat {
	label: string;
	value: string;
}

/** The five statistics from the original project dashboard. */
export function dashboardStats(
	items: readonly GoalProjectItem[],
	useTimekeep: boolean,
	format: TimeFormat,
): DashboardStat[] {
	const total = items.length;
	const inProgress = items.filter(
		(item) => item.status?.toLowerCase() === 'in progress',
	).length;
	const completed = items.filter(
		(item) => item.status?.toLowerCase() === 'completed',
	).length;
	const average =
		total > 0
			? Math.round(
					items.reduce((sum, item) => sum + item.counts.percent, 0) /
						total,
				)
			: 0;

	const stats: DashboardStat[] = [
		{ label: 'Total Projects', value: String(total) },
		{ label: 'In Progress', value: String(inProgress) },
		{ label: 'Completed', value: String(completed) },
		{ label: 'Avg Progress', value: `${average}%` },
	];

	if (useTimekeep) {
		stats.push({
			label: 'Total Hours',
			value: formatTrackedHours(
				items.reduce((sum, item) => sum + (item.hours ?? 0), 0),
				format,
			),
		});
	}

	return stats;
}
