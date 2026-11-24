/**
 * View models for the progress blocks. They are built from the cached index
 * only, so rendering never reads the vault or rescans notes.
 */
import { goalTitle } from '../index/names';
import type { GoalNode, ProjectNode, QuestlineIndex } from '../index/types';
import { computeGoalProgress, computeProjectProgress } from '../progress/progress';
import type { TaskProgress, TaskSource } from '../progress/tasks';
import type { QuestlineConfig } from '../settings/types';
import { sumWorkHours } from '../timekeep/timekeep';
import { parseTimespan } from '../time/timespan';
import { sortGoalProjects } from './projects';

export interface DueInfo {
	/** True for `Infinite`, which has no due date by design. */
	infinite: boolean;
	/** Due date as `YYYY-MM-DD`, or null when none can be computed. */
	dueDate: string | null;
	remainingDays: number | null;
	overdue: boolean;
	/** True when a timespan was set but could not be read. */
	invalid: boolean;
}

export interface GoalProgressView {
	name: string;
	counts: TaskProgress;
	projectCount: number;
	due: DueInfo | null;
	/** True when nothing counts toward progress and no project is linked. */
	empty: boolean;
}

export interface ProjectGoalLink {
	path: string;
	name: string;
}

export interface ProjectProgressView {
	name: string;
	counts: TaskProgress;
	status: string | null;
	goal: ProjectGoalLink | null;
	/** Tracked hours, or null when Timekeep totals are turned off. */
	workHours: number | null;
	/** True when the project has no tasks to measure. */
	empty: boolean;
}

export interface GoalProjectItem {
	path: string;
	name: string;
	status: string | null;
	counts: TaskProgress;
	authors: string[];
	/** Tracked hours, or null when Timekeep work hours are disabled. */
	hours: number | null;
}

function dayWord(days: number): string {
	return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Read the goal timespan against its creation date. */
export function goalDueInfo(
	timespan: string | null,
	created: string | null,
	now: Date,
): DueInfo | null {
	if (!timespan?.trim()) return null;

	const parsed = parseTimespan(timespan, { created, now });

	return {
		infinite: parsed.infinite,
		dueDate: parsed.dueDate,
		remainingDays: parsed.remainingDays,
		overdue: parsed.overdue,
		invalid: !parsed.valid,
	};
}

/** Human-readable due line for a goal block. */
export function describeDue(due: DueInfo | null): string {
	if (!due || due.infinite || !due.dueDate) return 'No due date';

	const { dueDate, remainingDays } = due;
	if (remainingDays === null) return `Due ${dueDate}`;
	if (remainingDays === 0) return `Due ${dueDate} (today)`;
	if (remainingDays < 0) {
		return `Due ${dueDate} (${dayWord(-remainingDays)} overdue)`;
	}

	return `Due ${dueDate} (${dayWord(remainingDays)} left)`;
}

function taskSource(
	index: QuestlineIndex,
	path: string,
): TaskSource | null {
	const note = index.notes.get(path);

	return note ? { tasks: note.tasks, headings: note.headings } : null;
}

/**
 * Goal progress: the goal's own tasks plus the tasks of every linked
 * project, or the goal's manual progress fields when the progress mode asks
 * for them and both fields are present.
 */
export function goalProgressView(
	index: QuestlineIndex,
	goal: GoalNode,
	config: QuestlineConfig,
	now: Date,
): GoalProgressView {
	const projects: (TaskSource & { path: string })[] = [];
	const seen = new Set<string>();

	for (const path of goal.projectPaths) {
		if (seen.has(path)) continue;
		seen.add(path);

		const project = index.projectByPath.get(path);
		const source = taskSource(index, path);
		if (project && source) projects.push({ path: project.path, ...source });
	}

	const manual = {
		progress: goal.fields.progress,
		target: goal.fields.target,
		start: goal.fields.start,
	};
	const hasManual =
		typeof manual.progress === 'number' && typeof manual.target === 'number';
	const counts =
		config.progressMode === 'manual' && !hasManual
			? { completed: 0, total: 0, percent: 0 }
			: computeGoalProgress(
					{
						tasks: taskSource(index, goal.path),
						manual: config.progressMode === 'tasks' ? null : manual,
						projects,
					},
					config.taskScope,
				);

	return {
		name: goalTitle(goal.name, goal.aliases),
		counts,
		projectCount: projects.length,
		due: goalDueInfo(goal.fields.timespan, goal.fields.created, now),
		empty: counts.total === 0 && projects.length === 0,
	};
}

/** Tracked hours rounded for display, without trailing zeros. */
export function formatHours(hours: number): string {
	return `${Math.round(hours * 100) / 100} h`;
}

/**
 * Project progress from the project's tasks, its status, its resolved goal,
 * and its Timekeep blocks. A standalone project simply has no goal link.
 */
export function projectProgressView(
	index: QuestlineIndex,
	project: ProjectNode,
	config: QuestlineConfig,
	now: Date,
): ProjectProgressView {
	const note = index.notes.get(project.path);
	const counts = note
		? computeProjectProgress(
				{ tasks: note.tasks, headings: note.headings },
				config.taskScope,
			)
		: { completed: 0, total: 0, percent: 0 };

	const goal = project.goalPath
		? index.goalByPath.get(project.goalPath)
		: undefined;

	return {
		name: project.name,
		counts,
		status: project.fields.status,
		goal: goal
			? { path: goal.path, name: goalTitle(goal.name, goal.aliases) }
			: null,
		workHours:
			config.useTimekeep && note
				? sumWorkHours(note.body, { now }).hours
				: null,
		empty: counts.total === 0,
	};
}

/**
 * The projects linked to a goal, each with its own progress. Duplicate links
 * collapse, and the order is the configured status order then the name, so
 * the list never reshuffles between refreshes.
 */
export function goalProjectsView(
	index: QuestlineIndex,
	goal: GoalNode,
	config: QuestlineConfig,
	now: Date = new Date(),
): GoalProjectItem[] {
	const items: GoalProjectItem[] = [];
	const seen = new Set<string>();

	for (const path of goal.projectPaths) {
		if (seen.has(path)) continue;
		seen.add(path);

		const project = index.projectByPath.get(path);
		if (!project) continue;

		const note = index.notes.get(path);
		const counts = note
			? computeProjectProgress(
					{ tasks: note.tasks, headings: note.headings },
					config.taskScope,
				)
			: { completed: 0, total: 0, percent: 0 };

		items.push({
			path: project.path,
			name: project.name,
			status: project.fields.status,
			counts,
			authors: project.fields.authors,
			hours:
				config.useTimekeep && note
					? sumWorkHours(note.body, { now }).hours
					: null,
		});
	}

	return sortGoalProjects(items, 'status', 'asc', config.projectStatuses);
}
