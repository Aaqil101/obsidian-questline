/**
 * Dashboard view models. They read the cached index only, so the dashboard
 * repaints without scanning the vault.
 */
import type { GoalNode, QuestlineIndex } from '../index/types';
import type { TaskProgress } from '../progress/tasks';
import type { QuestlineConfig } from '../settings/types';
import { sumWorkHours } from '../timekeep/timekeep';
import {
	goalProgressView,
	projectProgressView,
	type DueInfo,
	type ProjectGoalLink,
} from './model';
import { compareText, formatTrackedHours } from './projects';

const ARCHIVE_TYPE = 'archive';
const IN_PROGRESS = 'in progress';
const COMPLETED = 'completed';

export interface GoalOverviewItem {
	path: string;
	name: string;
	category: string | null;
	counts: TaskProgress;
	projectCount: number;
	due: DueInfo | null;
	/** Manual fields from the goal note, for the board card details. */
	progress: number | null;
	target: number | null;
	timespan: string | null;
	reason: string | null;
	/** Tracked hours across the linked projects, or null when Timekeep is off. */
	hours: number | null;
	/** True for `type: Archive`; the dashboard hides these by default. */
	archived: boolean;
}

export interface ProjectOverviewItem {
	path: string;
	name: string;
	subtitle: string | null;
	authors: string[];
	status: string | null;
	counts: TaskProgress;
	goals: ProjectGoalLink[];
	/** Tracked hours, or null when Timekeep totals are turned off. */
	hours: number | null;
}

export interface OverviewStat {
	label: string;
	value: string;
}

export type DueUrgency = 'overdue' | 'today' | 'soon' | 'later' | 'none';

export interface GoalCategoryGroup {
	category: string | null;
	goals: GoalOverviewItem[];
}

export type AttentionKind =
	| 'overdue-goal'
	| 'project-no-goal'
	| 'project-no-tasks';

export interface AttentionItem {
	kind: AttentionKind;
	path: string;
	name: string;
	detail: string;
}

export interface DashboardData {
	goals: GoalOverviewItem[];
	projects: ProjectOverviewItem[];
	attention: AttentionItem[];
	stats: OverviewStat[];
}

function isArchivedGoal(goal: GoalNode): boolean {
	return goal.fields.noteType?.trim().toLowerCase() === ARCHIVE_TYPE;
}

/** Configured categories first, then unknown ones, then no category. */
export function categoryRank(
	category: string | null,
	categories: readonly string[],
): number {
	if (category === null) return categories.length + 1;

	const found = categories.findIndex(
		(value) => value.toLowerCase() === category.toLowerCase(),
	);

	return found < 0 ? categories.length : found;
}

/** Category order, then unknown categories by name, then the goal name. */
export function compareGoalOverview(
	left: GoalOverviewItem,
	right: GoalOverviewItem,
	categories: readonly string[],
): number {
	const rank =
		categoryRank(left.category, categories) -
		categoryRank(right.category, categories);
	if (rank !== 0) return rank;

	const category = compareText(left.category ?? '', right.category ?? '');
	if (category !== 0) return category;

	const name = compareText(left.name, right.name);
	if (name !== 0) return name;

	return compareText(left.path, right.path);
}

export function dueUrgency(due: DueInfo | null): DueUrgency {
	if (!due || due.infinite || due.remainingDays === null) return 'none';
	if (due.overdue) return 'overdue';
	if (due.remainingDays === 0) return 'today';

	return due.remainingDays <= 7 ? 'soon' : 'later';
}

function goalHours(
	index: QuestlineIndex,
	goal: GoalNode,
	config: QuestlineConfig,
	now: Date,
	projectHours: ReadonlyMap<string, number | null>,
): number | null {
	if (!config.useTimekeep) return null;

	let total = 0;

	for (const path of goal.projectPaths) {
		const known = projectHours.get(path);
		if (known !== undefined) {
			total += known ?? 0;
			continue;
		}

		const note = index.notes.get(path);
		if (note) total += sumWorkHours(note.body, { now }).hours;
	}

	return total;
}

/** Every goal, including archived ones, in dashboard order. */
export function goalOverviewItems(
	index: QuestlineIndex,
	config: QuestlineConfig,
	now: Date = new Date(),
	projectHours: ReadonlyMap<string, number | null> = new Map(),
): GoalOverviewItem[] {
	const items = index.goals.map((goal) => {
		const view = goalProgressView(index, goal, config, now);

		return {
			path: goal.path,
			name: view.name,
			category: goal.fields.category,
			counts: view.counts,
			projectCount: view.projectCount,
			due: view.due,
			progress: goal.fields.progress,
			target: goal.fields.target,
			timespan: goal.fields.timespan,
			reason: goal.fields.reason,
			hours: goalHours(index, goal, config, now, projectHours),
			archived: isArchivedGoal(goal),
		};
	});

	return items.sort((left, right) =>
		compareGoalOverview(left, right, config.goalCategories),
	);
}

export function activeGoals(
	items: readonly GoalOverviewItem[],
): GoalOverviewItem[] {
	return items.filter((item) => !item.archived);
}

function sameCategory(left: string | null, right: string | null): boolean {
	if (left === null || right === null) return left === right;

	return left.toLowerCase() === right.toLowerCase();
}

/** Split already sorted goals into contiguous category groups. */
export function groupGoalsByCategory(
	goals: readonly GoalOverviewItem[],
): GoalCategoryGroup[] {
	const groups: GoalCategoryGroup[] = [];

	for (const goal of goals) {
		const last = groups[groups.length - 1];
		if (last && sameCategory(last.category, goal.category)) {
			last.goals.push(goal);
			continue;
		}

		groups.push({ category: goal.category, goals: [goal] });
	}

	return groups;
}

/** Every project in name order, whatever its status. */
export function projectOverviewItems(
	index: QuestlineIndex,
	config: QuestlineConfig,
	now: Date = new Date(),
): ProjectOverviewItem[] {
	const items = index.projects.map((project) => {
		const view = projectProgressView(index, project, config, now);

		return {
			path: project.path,
			name: view.name,
			subtitle: project.fields.subtitle,
			authors: project.fields.authors,
			status: view.status,
			counts: view.counts,
			goals: view.goals,
			hours: view.workHours,
		};
	});

	return items.sort((left, right) => {
		const name = compareText(left.name, right.name);

		return name !== 0 ? name : compareText(left.path, right.path);
	});
}

export function inProgressProjects(
	items: readonly ProjectOverviewItem[],
): ProjectOverviewItem[] {
	return items.filter(
		(item) => item.status?.trim().toLowerCase() === IN_PROGRESS,
	);
}

export type TimelineBucketKey =
	| 'overdue'
	| 'today'
	| 'week'
	| 'month'
	| 'later'
	| 'none';

export interface TimelineBucket {
	key: TimelineBucketKey;
	title: string;
	goals: GoalOverviewItem[];
}

const TIMELINE_BUCKETS: readonly {
	key: TimelineBucketKey;
	title: string;
}[] = [
	{ key: 'overdue', title: 'Overdue' },
	{ key: 'today', title: 'Today' },
	{ key: 'week', title: 'This week' },
	{ key: 'month', title: 'This month' },
	{ key: 'later', title: 'Later' },
	{ key: 'none', title: 'No due date' },
];

function timelineKey(goal: GoalOverviewItem): TimelineBucketKey {
	if (!goal.due || goal.due.infinite || goal.due.remainingDays === null) {
		return 'none';
	}

	const days = goal.due.remainingDays;
	if (goal.due.overdue || days < 0) return 'overdue';
	if (days === 0) return 'today';
	if (days <= 7) return 'week';
	if (days <= 30) return 'month';

	return 'later';
}

/** Goals grouped into due-date buckets, nearest first inside each bucket. */
export function timelineBuckets(
	goals: readonly GoalOverviewItem[],
): TimelineBucket[] {
	const buckets = TIMELINE_BUCKETS.map(({ key, title }) => ({
		key,
		title,
		goals: [] as GoalOverviewItem[],
	}));

	for (const goal of goals) {
		const key = timelineKey(goal);
		buckets.find((bucket) => bucket.key === key)?.goals.push(goal);
	}

	for (const bucket of buckets) {
		bucket.goals.sort((left, right) => {
			const leftDays =
				left.due?.remainingDays ?? Number.POSITIVE_INFINITY;
			const rightDays =
				right.due?.remainingDays ?? Number.POSITIVE_INFINITY;
			if (leftDays !== rightDays) return leftDays - rightDays;

			const name = compareText(left.name, right.name);

			return name !== 0 ? name : compareText(left.path, right.path);
		});
	}

	return buckets;
}

function statusCount(
	items: readonly ProjectOverviewItem[],
	status: string,
): number {
	return items.filter(
		(item) => item.status?.trim().toLowerCase() === status,
	).length;
}

export function overviewStats(
	goals: readonly GoalOverviewItem[],
	projects: readonly ProjectOverviewItem[],
	config: QuestlineConfig,
): OverviewStat[] {
	const average =
		projects.length === 0
			? 0
			: Math.round(
					projects.reduce((sum, item) => sum + item.counts.percent, 0) /
						projects.length,
				);

	const stats: OverviewStat[] = [
		{ label: 'Goals', value: String(activeGoals(goals).length) },
		{ label: 'Projects', value: String(projects.length) },
		{ label: 'In progress', value: String(statusCount(projects, IN_PROGRESS)) },
		{ label: 'Completed', value: String(statusCount(projects, COMPLETED)) },
		{ label: 'Avg progress', value: `${average}%` },
	];

	if (config.useTimekeep) {
		stats.push({
			label: 'Tracked time',
			value: formatTrackedHours(
				projects.reduce((sum, item) => sum + (item.hours ?? 0), 0),
				config.trackedTimeFormat,
			),
		});
	}

	return stats;
}

function dayText(days: number): string {
	return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** The work that most needs a look, most overdue first. */
export function attentionItems(
	goals: readonly GoalOverviewItem[],
	projects: readonly ProjectOverviewItem[],
): AttentionItem[] {
	const items: AttentionItem[] = [];
	const overdue = activeGoals(goals)
		.filter((goal) => dueUrgency(goal.due) === 'overdue')
		.sort(
			(left, right) =>
				(left.due?.remainingDays ?? 0) - (right.due?.remainingDays ?? 0),
		);

	for (const goal of overdue) {
		const days = Math.abs(goal.due?.remainingDays ?? 0);
		items.push({
			kind: 'overdue-goal',
			path: goal.path,
			name: goal.name,
			detail: `Overdue by ${dayText(days)}`,
		});
	}

	for (const project of inProgressProjects(projects)) {
		if (project.goals.length === 0) {
			items.push({
				kind: 'project-no-goal',
				path: project.path,
				name: project.name,
				detail: 'No goal linked',
			});
		} else if (project.counts.total === 0) {
			items.push({
				kind: 'project-no-tasks',
				path: project.path,
				name: project.name,
				detail: 'No tasks yet',
			});
		}
	}

	return items;
}

/** Everything the dashboard paints, computed once per repaint. */
export function dashboardData(
	index: QuestlineIndex,
	config: QuestlineConfig,
	now: Date = new Date(),
): DashboardData {
	const projects = projectOverviewItems(index, config, now);
	const hours = new Map<string, number | null>();
	for (const project of projects) hours.set(project.path, project.hours);

	const goals = goalOverviewItems(index, config, now, hours);

	return {
		goals,
		projects,
		attention: attentionItems(goals, projects),
		stats: overviewStats(goals, projects, config),
	};
}
