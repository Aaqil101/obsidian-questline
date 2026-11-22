import {
	ALL_TASKS,
	computeTaskProgress,
	type TaskProgress,
	type TaskScope,
	type TaskSource,
} from './tasks';

export interface ManualProgress {
	/** Current value, read from the goal's `progress` field. */
	progress: number | null;
	/** Goal value, read from the goal's `target` field. */
	target: number | null;
	/** Optional starting value, used for descending goals. */
	start?: number | null;
}

export interface ManualProgressValues {
	progress: number;
	target: number;
	start?: number | null;
}

export interface GoalProgressInput {
	tasks?: TaskSource | null;
	manual?: ManualProgress | null;
	/** Linked projects; a project listed twice counts once. */
	projects?: readonly (TaskSource & { path: string })[];
}

export function computeProjectProgress(
	source: TaskSource,
	scope: TaskScope = ALL_TASKS,
): TaskProgress {
	return computeTaskProgress(source, scope);
}

export function computeManualProgress(manual: ManualProgressValues): TaskProgress {
	const { progress, target, start } = manual;

	let value: number;
	let max: number;

	if (start !== undefined && start !== null) {
		if (progress > target) {
			// Descending goal: start at the higher value and work down.
			max = start - target;
			value = start - progress;
		} else {
			max = target - start;
			value = progress - start;
		}
	} else {
		max = target;
		value = progress;
	}

	return {
		completed: progress,
		total: target,
		percent:
			Number.isFinite(value) && Number.isFinite(max) && max !== 0
				? Math.round((value / max) * 100)
				: 0,
	};
}

/**
 * Goal progress is the goal's own tasks plus the tasks of every linked
 * project, deduplicated by path. A goal with manual `progress` and `target`
 * fields uses those numbers instead of its tasks.
 */
export function computeGoalProgress(
	goal: GoalProgressInput,
	scope: TaskScope = ALL_TASKS,
): TaskProgress {
	const manual = goal.manual;
	if (
		manual &&
		typeof manual.progress === 'number' &&
		typeof manual.target === 'number'
	) {
		return computeManualProgress({
			progress: manual.progress,
			target: manual.target,
			start: manual.start,
		});
	}

	const own = goal.tasks
		? computeTaskProgress(goal.tasks, scope)
		: { completed: 0, total: 0, percent: 0 };

	let completed = own.completed;
	let total = own.total;
	const seen = new Set<string>();

	for (const project of goal.projects ?? []) {
		if (seen.has(project.path)) continue;
		seen.add(project.path);

		const progress = computeTaskProgress(project, scope);
		completed += progress.completed;
		total += progress.total;
	}

	return {
		completed,
		total,
		percent: total === 0 ? 0 : Math.round((completed / total) * 100),
	};
}
