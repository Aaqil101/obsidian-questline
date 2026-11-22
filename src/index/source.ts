import { TFile, type App } from 'obsidian';
import type { NoteData, NoteFile, NoteReader, TimerApi } from './service';

/** Window-backed timers, so background refreshes follow popout windows. */
export const WINDOW_TIMERS: TimerApi = {
	set: (callback, delayMs) => window.setTimeout(callback, delayMs),
	clear: (handle) => {
		window.clearTimeout(handle as number);
	},
};
export function createVaultReader(app: App): NoteReader {
	return {
		listNotes(): NoteFile[] {
			return app.vault.getMarkdownFiles().map((file) => ({
				path: file.path,
				mtime: file.stat.mtime,
			}));
		},

		async readNote(path: string): Promise<NoteData> {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				throw new Error(`Not a Markdown file: ${path}`);
			}

			const body = await app.vault.cachedRead(file);
			const cache = app.metadataCache.getFileCache(file);

			return {
				body,
				frontmatter: cache?.frontmatter ?? null,
				tasks: (cache?.listItems ?? []).map((item) => ({
					line: item.position.start.line,
					parent: item.parent,
					status: item.task,
				})),
				headings: (cache?.headings ?? []).map((heading) => ({
					line: heading.position.start.line,
					heading: heading.heading,
					level: heading.level,
				})),
			};
		},
	};
}
