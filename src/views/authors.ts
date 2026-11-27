/** Author display: plain text, or wikilinks when the setting is on. */
import type { App } from 'obsidian';
import { ensureAuthorNote } from '../creation/authorNotes';
import type { QuestlineConfig } from '../settings/types';

const PLAIN_NONE = 'None';

export function renderAuthors(
	containerEl: HTMLElement,
	authors: readonly string[],
	config: QuestlineConfig,
	app: App,
	sourcePath: string,
): void {
	if (authors.length === 0) {
		containerEl.createSpan({ text: PLAIN_NONE });

		return;
	}

	if (!config.authorWikilink) {
		containerEl.createSpan({ text: authors.join(', ') });

		return;
	}

	authors.forEach((author, index) => {
		if (index > 0) containerEl.createSpan({ text: ', ' });

		const link = containerEl.createEl('a', {
			cls: 'internal-link questline-author-link',
			text: author,
			attr: { href: author },
		});
		link.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			void (async () => {
				const file = await ensureAuthorNote(
					app,
					config,
					author,
					sourcePath,
				);
				if (!file) return;

				const leaf = app.workspace.getLeaf(
					event.ctrlKey || event.metaKey ? 'tab' : false,
				);
				await leaf.openFile(file);
			})();
		});
	});
}
