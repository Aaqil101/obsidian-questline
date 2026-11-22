import type { HeadingItem, TaskItem } from '../index/types';

/** Task status as Questline counts it, not as Obsidian renders it. */
export type TaskStatus = 'done' | 'cancelled' | 'open' | 'none';

export interface TaskNode {
	line: number;
	status: TaskStatus;
	isTask: boolean;
	children: TaskNode[];
}

export interface TaskProgress {
	completed: number;
	total: number;
	/** Completed divided by total, rounded. 0 when there are no tasks. */
	percent: number;
}

export interface TaskSource {
	tasks: readonly TaskItem[];
	headings?: readonly HeadingItem[];
}

export type TaskScope =
	| { type: 'all' }
	| { type: 'heading'; heading: string };

export const ALL_TASKS: TaskScope = { type: 'all' };

/**
 * Obsidian stores the checkbox character in `ListItemCache.task`. Only `x`
 * counts as done; `-` is cancelled, and every other character (including
 * custom ones such as `/`) is still open.
 */
function statusOf(item: TaskItem): TaskStatus {
	if (item.status === undefined) return 'none';
	if (item.status.toLowerCase() === 'x') return 'done';
	if (item.status === '-') return 'cancelled';

	return 'open';
}

function findHeading(
	headings: readonly HeadingItem[],
	name: string,
): HeadingItem | null {
	const wanted = name.trim().toLowerCase();

	return (
		headings.find((heading) => heading.heading.trim().toLowerCase() === wanted) ??
		null
	);
}

function scopeRange(
	source: TaskSource,
	scope: TaskScope,
): { start: number; end: number } {
	if (scope.type === 'all') return { start: -Infinity, end: Infinity };

	const headings = source.headings ?? [];
	const heading = findHeading(headings, scope.heading);
	if (!heading) return { start: Infinity, end: -Infinity };

	const next = headings.find(
		(candidate) =>
			candidate.line > heading.line && candidate.level <= heading.level,
	);

	return {
		start: heading.line + 1,
		end: next ? next.line : Infinity,
	};
}

/** Build the list item tree, keeping plain bullets so nesting survives. */
export function buildTaskTree(
	source: TaskSource,
	scope: TaskScope = ALL_TASKS,
): TaskNode[] {
	const { start, end } = scopeRange(source, scope);
	const items = [...source.tasks]
		.filter((item) => item.line >= start && item.line < end)
		.sort((left, right) => left.line - right.line);

	const nodes = new Map<number, TaskNode>();
	const roots: TaskNode[] = [];

	for (const item of items) {
		const node: TaskNode = {
			line: item.line,
			status: statusOf(item),
			isTask: item.status !== undefined,
			children: [],
		};

		nodes.set(item.line, node);

		const parent = item.parent >= 0 ? nodes.get(item.parent) : undefined;
		if (parent) parent.children.push(node);
		else roots.push(node);
	}

	return roots;
}

/**
 * A task is complete only when it and every non-cancelled descendant is
 * complete. Cancelled tasks are left out of that check, so they cannot keep
 * a finished parent open.
 */
function isComplete(node: TaskNode): boolean {
	if (node.status !== 'done') return false;

	return descendantsComplete(node.children);
}

function descendantsComplete(nodes: readonly TaskNode[]): boolean {
	for (const node of nodes) {
		if (node.isTask && node.status !== 'cancelled' && !isComplete(node)) {
			return false;
		}

		if (!descendantsComplete(node.children)) return false;
	}

	return true;
}

interface Counts {
	completed: number;
	total: number;
}

function countNode(node: TaskNode): Counts {
	// An abandoned task takes its subtree with it.
	if (node.isTask && node.status === 'cancelled') {
		return { completed: 0, total: 0 };
	}

	const counts: Counts = {
		completed: node.isTask && isComplete(node) ? 1 : 0,
		total: node.isTask ? 1 : 0,
	};

	for (const child of node.children) {
		const childCounts = countNode(child);
		counts.completed += childCounts.completed;
		counts.total += childCounts.total;
	}

	return counts;
}

export function computeTaskProgress(
	source: TaskSource,
	scope: TaskScope = ALL_TASKS,
): TaskProgress {
	let completed = 0;
	let total = 0;

	for (const root of buildTaskTree(source, scope)) {
		const counts = countNode(root);
		completed += counts.completed;
		total += counts.total;
	}

	return {
		completed,
		total,
		percent: total === 0 ? 0 : Math.round((completed / total) * 100),
	};
}
