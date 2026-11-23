import { resolveNote } from '../fields/resolve';
import { DEFAULT_CONFIG, type QuestlineConfig } from '../settings/types';
import { buildIndex, emptyIndex } from './build';
import type {
	HeadingItem,
	NoteSnapshot,
	QuestlineIndex,
	TaskItem,
} from './types';

export interface NoteFile {
	path: string;
	mtime: number;
}

/** Raw note data, before the field resolver runs. */
export interface NoteData {
	body: string;
	frontmatter: Record<string, unknown> | null;
	tasks: readonly TaskItem[];
	headings: readonly HeadingItem[];
}

/** Everything the index needs from the vault, so it can run without Obsidian. */
export interface NoteReader {
	listNotes(): readonly NoteFile[];
	readNote(path: string): Promise<NoteData>;
}

export interface IndexServiceOptions {
	/** Coalescing window for vault events. */
	debounceMs?: number;
	/** Timer source. The plugin passes window-backed timers for popout windows. */
	timers?: TimerApi;
	/** Validated settings that decide which notes are goals and projects. */
	config?: QuestlineConfig;
}

export interface TimerApi {
	set(callback: () => void, delayMs: number): unknown;
	clear(handle: unknown): void;
}

const DEFAULT_TIMERS: TimerApi = {
	// This module also runs in tests, where `window` does not exist. Aliasing
	// keeps the calls off the bare timer names; the plugin supplies window
	// timers for popout windows.
	set: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
	clear: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type RefreshListener = (index: QuestlineIndex) => void;

const DEFAULT_DEBOUNCE_MS = 250;

/**
 * Read-only goal and project index. Notes are cached by path and mtime, so a
 * refresh only reads files that appeared or changed. Rendering reads the
 * cached index and never touches the vault.
 */
export class QuestlineIndexService {
	private readonly cache = new Map<string, NoteSnapshot>();
	private readonly listeners = new Set<RefreshListener>();
	private readonly debounceMs: number;
	private readonly timers: TimerApi;
	private config: QuestlineConfig;
	private index = emptyIndex();
	private queue: Promise<void> = Promise.resolve();
	private timer: unknown = null;

	constructor(
		private readonly reader: NoteReader,
		options: IndexServiceOptions = {},
	) {
		this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
		this.timers = options.timers ?? DEFAULT_TIMERS;
		this.config = options.config ?? DEFAULT_CONFIG;
	}

	getIndex(): QuestlineIndex {
		return this.index;
	}

	getConfig(): QuestlineConfig {
		return this.config;
	}

	/**
	 * Swap in new settings. Tags change how every note resolves, so the cache
	 * is dropped after the current scan finishes and the next refresh reads
	 * the vault again. Settings that do not affect the index leave it alone.
	 */
	async setConfig(config: QuestlineConfig): Promise<boolean> {
		const retag =
			config.goalTag !== this.config.goalTag ||
			config.projectTag !== this.config.projectTag;

		if (!retag) {
			this.config = config;
			return false;
		}

		// Wait, so an in-flight scan cannot leave a mix of old and new tags.
		await this.queue;
		this.config = config;
		this.cache.clear();

		return true;
	}

	/** Subscribe to rebuilt indexes. Returns an unsubscribe function. */
	onRefresh(listener: RefreshListener): () => void {
		this.listeners.add(listener);

		return () => {
			this.listeners.delete(listener);
		};
	}

	/** Drop a cached note, so the next refresh reads it again. */
	forget(path: string): void {
		this.cache.delete(path);
	}

	/** Refresh after a short delay, coalescing bursts of vault events. */
	scheduleRefresh(delayMs = this.debounceMs): void {
		if (this.timer !== null) this.timers.clear(this.timer);

		this.timer = this.timers.set(() => {
			this.timer = null;
			void this.refresh();
		}, delayMs);
	}

	/** Refresh now. Concurrent callers share the same queued rebuild. */
	refresh(): Promise<QuestlineIndex> {
		const run = this.queue.then(() => this.rebuild());

		this.queue = run.then(
			() => undefined,
			() => undefined,
		);

		return run.then(() => this.index);
	}

	/**
	 * Re-emit the current index without reading the vault. Settings that
	 * only affect rendering use this so open blocks repaint immediately.
	 */
	notifyRefresh(): void {
		for (const listener of this.listeners) listener(this.index);
	}

	destroy(): void {
		if (this.timer !== null) this.timers.clear(this.timer);
		this.timer = null;
		this.listeners.clear();
		this.cache.clear();
	}

	private async rebuild(): Promise<void> {
		const files = this.reader.listNotes();
		const filesByPath = new Map(files.map((file) => [file.path, file]));
		let changed = false;

		for (const path of [...this.cache.keys()]) {
			if (filesByPath.has(path)) continue;
			this.cache.delete(path);
			changed = true;
		}

		for (const file of files) {
			const cached = this.cache.get(file.path);
			if (cached && cached.mtime === file.mtime) continue;

			let data: NoteData;
			try {
				data = await this.reader.readNote(file.path);
			} catch {
				// The file may have been deleted between listing and reading.
				this.cache.delete(file.path);
				changed = true;
				continue;
			}

			this.cache.set(file.path, {
				path: file.path,
				mtime: file.mtime,
				fields: resolveNote(
					{
						path: file.path,
						frontmatter: data.frontmatter,
						body: data.body,
					},
					{
						goalTag: this.config.goalTag,
						projectTag: this.config.projectTag,
					},
				),
				tasks: data.tasks,
				headings: data.headings,
				body: data.body,
			});
			changed = true;
		}

		if (!changed) return;

		this.index = buildIndex(this.cache.values());

		for (const listener of this.listeners) listener(this.index);
	}
}
