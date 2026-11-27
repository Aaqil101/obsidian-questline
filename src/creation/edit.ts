/**
 * Pure helpers for editing indexed goals and projects: draft prefill, rename
 * targets, and frontmatter mutations. The modals and commands supply the
 * vault, clock, and path checks.
 */
import { noteFolder } from '../index/build';
import { goalTitle } from '../index/names';
import type { GoalNode, ProjectNode } from '../index/types';
import { findFrontmatterKey, removeFrontmatterKey } from './frontmatter';
import {
	allocatePath,
	noteLink,
	sanitizeName,
	type ProjectGoalLink,
} from './plan';

export interface GoalEditDraft {
	title: string;
	category: string;
	reason: string;
	timespan: string;
}

export interface ProjectEditDraft {
	title: string;
	goals: ProjectGoalLink[];
	status: string;
	author: string;
	subtitle: string;
}

/** The requested rename path and the free path after any suffix. */
export interface RenamePlan {
	requestedPath: string;
	path: string;
}

export function goalEditDraft(goal: GoalNode): GoalEditDraft {
	return {
		title: goalTitle(goal.name, goal.aliases),
		category: goal.fields.category ?? '',
		reason: goal.fields.reason ?? '',
		timespan: goal.fields.timespan ?? '',
	};
}

export function projectGoalLink(goal: GoalNode): ProjectGoalLink {
	return {
		path: goal.path,
		name: goal.name,
		display: goal.aliases[0],
	};
}

/** The linked goals that still resolve, in the project's link order. */
export function projectGoalNodes(
	project: ProjectNode,
	goalByPath: ReadonlyMap<string, GoalNode>,
): GoalNode[] {
	const goals: GoalNode[] = [];

	for (const path of project.goalPaths) {
		const goal = goalByPath.get(path);
		if (goal) goals.push(goal);
	}

	return goals;
}

export function projectEditDraft(
	project: ProjectNode,
	goals: readonly GoalNode[],
): ProjectEditDraft {
	return {
		title: goalTitle(project.name, project.fields.aliases),
		goals: goals.map(projectGoalLink),
		status: project.fields.status ?? '',
		author: project.fields.authors.join(', '),
		subtitle: project.fields.subtitle ?? '',
	};
}

function normalizeTarget(value: string): string {
	return value.replace(/\.md$/i, '').trim().toLowerCase();
}

function goalKeys(goals: readonly GoalNode[]): Map<string, string> {
	const keys = new Map<string, string>();

	const add = (key: string, path: string): void => {
		const normalized = normalizeTarget(key);
		if (normalized && !keys.has(normalized)) keys.set(normalized, path);
	};

	for (const goal of goals) {
		add(goal.path, goal.path);
		add(goal.name, goal.path);
		for (const alias of goal.aliases) add(alias, goal.path);
	}

	return keys;
}

function resolveTarget(
	keys: ReadonlyMap<string, string>,
	target: string,
): string | null {
	const key = normalizeTarget(target);
	if (!key) return null;

	const direct = keys.get(key);
	if (direct) return direct;

	const name = normalizeTarget(key.slice(key.lastIndexOf('/') + 1));

	return keys.get(name) ?? null;
}

/** Goal links in the note that no longer resolve to an indexed goal. */
export function unresolvedGoalCount(
	project: ProjectNode,
	goals: readonly GoalNode[],
): number {
	const keys = goalKeys(goals);
	const resolved = new Set(project.goalPaths);
	let count = 0;

	for (const link of project.fields.goals) {
		const path = resolveTarget(keys, link.target);
		if (!path || !resolved.has(path)) count += 1;
	}

	return count;
}

/** Authors are stored comma-separated in the editor. */
export function parseAuthors(value: string): string[] {
	const authors: string[] = [];
	const seen = new Set<string>();

	for (const part of value.split(',')) {
		const text = part.trim();
		const key = text.toLowerCase();
		if (!text || seen.has(key)) continue;

		seen.add(key);
		authors.push(text);
	}

	return authors;
}

function writeKey(
	frontmatter: Record<string, unknown>,
	key: string,
	value: unknown,
): void {
	const existing = findFrontmatterKey(frontmatter, key);
	frontmatter[existing ?? key] = value;
}

function writeOrRemove(
	frontmatter: Record<string, unknown>,
	key: string,
	value: string,
): void {
	const text = value.trim();
	if (text) writeKey(frontmatter, key, text);
	else removeFrontmatterKey(frontmatter, key);
}

function writeAliases(
	frontmatter: Record<string, unknown>,
	title: string,
): void {
	const key =
		findFrontmatterKey(frontmatter, 'aliases') ??
		findFrontmatterKey(frontmatter, 'alias') ??
		'aliases';
	const existing = frontmatter[key];
	const aliases = Array.isArray(existing)
		? existing.filter(
				(item): item is string =>
					typeof item === 'string' && item.trim() !== '',
			)
		: [];

	aliases[0] = sanitizeName(title) || title.trim();
	frontmatter[key] = aliases;
}

export function applyGoalEdit(
	frontmatter: Record<string, unknown>,
	draft: GoalEditDraft,
): void {
	writeAliases(frontmatter, draft.title);
	writeOrRemove(frontmatter, 'category', draft.category);
	writeOrRemove(frontmatter, 'reason', draft.reason);
	writeOrRemove(frontmatter, 'timespan', draft.timespan);
}

export function applyProjectEdit(
	frontmatter: Record<string, unknown>,
	draft: ProjectEditDraft,
): void {
	writeAliases(frontmatter, draft.title);

	const links = draft.goals.map(noteLink);
	if (links.length === 0) removeFrontmatterKey(frontmatter, 'goal');
	else writeKey(frontmatter, 'goal', links.length === 1 ? links[0] : links);

	writeKey(frontmatter, 'status', draft.status.trim());

	const authors = parseAuthors(draft.author);
	if (authors.length === 0) {
		removeFrontmatterKey(frontmatter, 'author');
		removeFrontmatterKey(frontmatter, 'authors');
	} else {
		const key =
			findFrontmatterKey(frontmatter, 'author') ??
			findFrontmatterKey(frontmatter, 'authors') ??
			'author';
		writeKey(frontmatter, key, authors.length === 1 ? authors[0] : authors);
	}

	writeOrRemove(frontmatter, 'subtitle', draft.subtitle);
}

/**
 * Rename a note to its sanitized title inside its current folder. A null plan
 * means the sanitized name matches the current path, so no rename is needed.
 * The caller confirms when the requested path is taken and `path` has a
 * numeric suffix.
 */
export function planRename(
	currentPath: string,
	currentTitle: string,
	title: string,
	exists: (path: string) => boolean,
): RenamePlan | null {
	if (title.trim() === currentTitle.trim()) return null;

	const name = sanitizeName(title);
	if (!name) return null;

	const folder = noteFolder(currentPath);
	const requestedPath = folder ? `${folder}/${name}.md` : `${name}.md`;
	if (requestedPath.toLowerCase() === currentPath.toLowerCase()) return null;

	return {
		requestedPath,
		path: allocatePath(
			folder,
			name,
			(candidate) =>
				candidate.toLowerCase() !== currentPath.toLowerCase() &&
				exists(candidate),
		),
	};
}
