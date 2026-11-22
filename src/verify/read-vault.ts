import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import type { NoteData, NoteFile, NoteReader } from '../index/service';
import type { HeadingItem, TaskItem } from '../index/types';

export interface VaultStamp {
	path: string;
	size: number;
	mtimeMs: number;
}

export interface VaultNote {
	path: string;
	mtime: number;
	text: string;
	frontmatter: Record<string, unknown> | null;
	body: string;
	tasks: TaskItem[];
	headings: HeadingItem[];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function listMarkdown(root: string): string[] {
	const files: string[] = [];

	const walk = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) walk(absolute);
			else if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute);
		}
	};

	walk(root);

	return files;
}

function relativePath(root: string, absolute: string): string {
	return relative(root, absolute).split(sep).join('/');
}

function splitFrontmatter(text: string): {
	frontmatter: Record<string, unknown> | null;
	body: string;
} {
	const match = FRONTMATTER.exec(text);
	if (!match) return { frontmatter: null, body: text };

	let frontmatter: Record<string, unknown> | null = null;
	try {
		const parsed: unknown = parse(match[1] ?? '');
		if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
			frontmatter = parsed as Record<string, unknown>;
		}
	} catch {
		frontmatter = null;
	}

	return { frontmatter, body: text.slice(match[0].length) };
}

/**
 * Approximate Obsidian's metadata cache closely enough to verify the index:
 * tasks with their parent list lines, and ATX headings outside code fences.
 */
function scanBody(body: string): {
	tasks: TaskItem[];
	headings: HeadingItem[];
} {
	const tasks: TaskItem[] = [];
	const headings: HeadingItem[] = [];
	const stack: { indent: number; line: number }[] = [];
	let fence: string | null = null;

	const lines = body.split(/\r?\n/);

	for (let line = 0; line < lines.length; line += 1) {
		const text = lines[line] ?? '';

		const fenceMatch = /^\s*(```+|~~~+)/.exec(text);
		if (fenceMatch) {
			const marker = fenceMatch[1] ?? '';
			if (!fence) fence = marker;
			else if (text.trim().startsWith(fence)) fence = null;
			continue;
		}
		if (fence) continue;

		const heading = /^(#{1,6})\s+(.*)$/.exec(text);
		if (heading) {
			headings.push({
				line,
				heading: (heading[2] ?? '').trim(),
				level: (heading[1] ?? '').length,
			});
			stack.length = 0;
			continue;
		}

		const item = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[(.)\]\s+)?/.exec(text);
		if (!item) {
			// An unindented paragraph closes the current list.
			if (text.trim() && !/^\s/.test(text)) stack.length = 0;
			continue;
		}

		const indent = (item[1] ?? '').replace(/\t/g, '    ').length;
		while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? -1) >= indent) {
			stack.pop();
		}

		const parent = stack[stack.length - 1]?.line ?? -1;
		const status = item[2];

		tasks.push({
			line,
			parent,
			...(status === undefined ? {} : { status }),
		});
		stack.push({ indent, line });
	}

	return { tasks, headings };
}

function readNote(root: string, absolute: string): VaultNote {
	const text = readFileSync(absolute, 'utf8');
	const { frontmatter, body } = splitFrontmatter(text);
	const { tasks, headings } = scanBody(body);

	return {
		path: relativePath(root, absolute),
		mtime: statSync(absolute).mtimeMs,
		text,
		frontmatter,
		body,
		tasks,
		headings,
	};
}

/** Read-only view of a vault on disk, used only by the verification test. */
export class ReferenceVault implements NoteReader {
	private readonly notesByPath = new Map<string, VaultNote>();
	private readonly stampsByPath = new Map<string, VaultStamp>();

	constructor(readonly root: string) {
		for (const absolute of listMarkdown(root)) {
			const note = readNote(root, absolute);
			const stat = statSync(absolute);

			this.notesByPath.set(note.path, note);
			this.stampsByPath.set(note.path, {
				path: note.path,
				size: stat.size,
				mtimeMs: stat.mtimeMs,
			});
		}
	}

	get notes(): VaultNote[] {
		return [...this.notesByPath.values()].sort((left, right) =>
			left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
		);
	}

	note(path: string): VaultNote | undefined {
		return this.notesByPath.get(path);
	}

	/** Stable fingerprint of every Markdown file, to prove the run did not write. */
	snapshot(): string {
		return [...this.stampsByPath.values()]
			.sort((left, right) =>
				left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
			)
			.map((stamp) => `${stamp.path}:${stamp.size}:${stamp.mtimeMs}`)
			.join('\n');
	}

	/** Re-read the tree and compare it with the constructor snapshot. */
	currentSnapshot(): string {
		return [...listMarkdown(this.root)]
			.map((absolute) => {
				const stat = statSync(absolute);
				const path = relativePath(this.root, absolute);

				return `${path}:${stat.size}:${stat.mtimeMs}`;
			})
			.sort()
			.join('\n');
	}

	listNotes(): NoteFile[] {
		return this.notes.map((note) => ({
			path: note.path,
			mtime: note.mtime,
		}));
	}

	async readNote(path: string): Promise<NoteData> {
		const note = this.notesByPath.get(path);
		if (!note) throw new Error(`Missing note: ${path}`);

		return {
			body: note.body,
			frontmatter: note.frontmatter,
			tasks: note.tasks,
			headings: note.headings,
		};
	}
}
