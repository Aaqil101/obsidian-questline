import type { ResolvedFields } from '../fields/resolve';

/** Minimal list item data, mapped from Obsidian's `ListItemCache`. */
export interface TaskItem {
	/** 0-based line where the list item starts. */
	line: number;
	/** Line of the parent list item, negative when the item starts a list. */
	parent: number;
	/** Checkbox character, absent for a plain list item. */
	status?: string;
}

/** Minimal heading data, mapped from Obsidian's `HeadingCache`. */
export interface HeadingItem {
	/** 0-based line where the heading starts. */
	line: number;
	heading: string;
	level: number;
}

/** One resolved note, cached by path and mtime. */
export interface NoteSnapshot {
	path: string;
	mtime: number;
	fields: ResolvedFields;
	tasks: readonly TaskItem[];
	headings: readonly HeadingItem[];
	/** Raw note body, kept so later passes need no extra vault read. */
	body: string;
}

export interface GoalNode {
	path: string;
	/** File name without `.md` or a leading `; `. */
	name: string;
	aliases: string[];
	fields: ResolvedFields;
	/** Paths of the projects that link to this goal. */
	projectPaths: string[];
}

export interface ProjectNode {
	path: string;
	/** File name without `.md` or a leading `; `. */
	name: string;
	/** Parent folder path, or an empty string at the vault root. */
	folder: string;
	/** Folder that holds the project note, when it uses the `Name/Name.md` layout. */
	folderProject: string | null;
	fields: ResolvedFields;
	/** Resolved goal paths, in link order. Empty when no link resolves. */
	goalPaths: string[];
}

export interface QuestlineIndex {
	goals: GoalNode[];
	projects: ProjectNode[];
	goalByPath: ReadonlyMap<string, GoalNode>;
	projectByPath: ReadonlyMap<string, ProjectNode>;
	/** Snapshots of the indexed notes only, keyed by path. */
	notes: ReadonlyMap<string, NoteSnapshot>;
}
