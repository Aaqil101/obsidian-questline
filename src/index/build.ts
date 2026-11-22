import type { ResolvedFields } from '../fields/resolve';
import type {
	GoalNode,
	NoteSnapshot,
	ProjectNode,
	QuestlineIndex,
} from './types';

export const TEMPLATE_TYPE = 'questline-template';

/** File name without its folder, `.md` extension, or leading `; `. */
export function noteName(path: string): string {
	const file = path.slice(path.lastIndexOf('/') + 1);
	const stem = file.toLowerCase().endsWith('.md') ? file.slice(0, -3) : file;

	return stem.replace(/^;\s*/, '').trim() || stem;
}

/** Parent folder path, or an empty string at the vault root. */
export function noteFolder(path: string): string {
	const slash = path.lastIndexOf('/');

	return slash < 0 ? '' : path.slice(0, slash);
}

/**
 * The folder that holds a folder-style project note (`Name/Name.md` or
 * `Name/; Name.md`), or null for a top-level `; Name.md` note.
 */
export function projectFolder(path: string): string | null {
	const folder = noteFolder(path);
	if (!folder) return null;

	const parent = folder.slice(folder.lastIndexOf('/') + 1).replace(/^;\s*/, '');

	return parent.toLowerCase() === noteName(path).toLowerCase() ? folder : null;
}

export function isTemplate(fields: ResolvedFields): boolean {
	return fields.noteType?.trim().toLowerCase() === TEMPLATE_TYPE;
}

/** A project needs the tag plus a status or `Class: Project Class`. */
export function isIndexedProject(fields: ResolvedFields): boolean {
	return fields.isProject && fields.hasProjectMarker;
}

function normalizeKey(value: string): string {
	return value.replace(/\.md$/i, '').trim().toLowerCase();
}

/** Deterministic ordering that does not depend on the host locale. */
function comparePaths(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function addKey(
	keys: Map<string, string>,
	key: string,
	path: string,
): void {
	const normalized = normalizeKey(key);
	if (normalized && !keys.has(normalized)) keys.set(normalized, path);
}

interface GoalLookup {
	paths: Map<string, string>;
	names: Map<string, string>;
	aliases: Map<string, string>;
}

function buildLookup(goals: readonly GoalNode[]): GoalLookup {
	const lookup: GoalLookup = {
		paths: new Map(),
		names: new Map(),
		aliases: new Map(),
	};

	for (const goal of goals) {
		addKey(lookup.paths, goal.path, goal.path);
		addKey(lookup.names, goal.name, goal.path);

		for (const alias of goal.aliases) addKey(lookup.aliases, alias, goal.path);
	}

	return lookup;
}

function resolveGoal(lookup: GoalLookup, target: string): string | null {
	const key = normalizeKey(target);
	if (!key) return null;

	const direct =
		lookup.paths.get(key) ?? lookup.names.get(key) ?? lookup.aliases.get(key);
	if (direct) return direct;

	// A link may carry a folder that the goal keys do not, so fall back to
	// the file name at the end of the target.
	const name = normalizeKey(key.slice(key.lastIndexOf('/') + 1));

	return lookup.names.get(name) ?? lookup.aliases.get(name) ?? null;
}

export function emptyIndex(): QuestlineIndex {
	return {
		goals: [],
		projects: [],
		goalByPath: new Map(),
		projectByPath: new Map(),
		notes: new Map(),
	};
}

/**
 * Build the read-only index from cached note snapshots. A note counts as a
 * goal when tagged `goal`, and as a project only when tagged `project` and
 * marked with a project status or `Class: Project Class`. Templates never
 * enter the index, and a note that is both a goal and a project is indexed
 * as a goal.
 */
export function buildIndex(notes: Iterable<NoteSnapshot>): QuestlineIndex {
	const sorted = [...notes].sort((left, right) =>
		comparePaths(left.path, right.path),
	);

	const goals: GoalNode[] = [];
	const projects: ProjectNode[] = [];
	const notesByPath = new Map<string, NoteSnapshot>();

	for (const note of sorted) {
		const { fields } = note;
		if (isTemplate(fields)) continue;

		if (fields.isGoal) {
			goals.push({
				path: note.path,
				name: noteName(note.path),
				aliases: fields.aliases,
				fields,
				projectPaths: [],
			});
			notesByPath.set(note.path, note);
		} else if (isIndexedProject(fields)) {
			projects.push({
				path: note.path,
				name: noteName(note.path),
				folder: noteFolder(note.path),
				folderProject: projectFolder(note.path),
				fields,
				goalPath: null,
			});
			notesByPath.set(note.path, note);
		}
	}

	const goalByPath = new Map(goals.map((goal) => [goal.path, goal]));
	const lookup = buildLookup(goals);
	const projectByPath = new Map(projects.map((project) => [project.path, project]));

	for (const project of projects) {
		const target = project.fields.goal?.target;
		if (!target) continue;

		const goalPath = resolveGoal(lookup, target);
		if (!goalPath) continue;

		project.goalPath = goalPath;
		goalByPath.get(goalPath)?.projectPaths.push(project.path);
	}

	for (const goal of goals) {
		goal.projectPaths.sort(comparePaths);
	}

	return {
		goals,
		projects,
		goalByPath,
		projectByPath,
		notes: notesByPath,
	};
}
