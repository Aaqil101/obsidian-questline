/**
 * Create author notes for wikilinks that do not point at an existing note,
 * so a linked author is always openable from a project.
 */
import { Notice, TFile, type App } from 'obsidian';
import { collectJournalDates } from '../journal/collect';
import { journalDate } from '../journal/dates';
import type { QuestlineConfig } from '../settings/types';
import { BUILTIN_AUTHOR } from '../templates/builtin';
import { composeNote } from '../templates/document';
import { ensureVaultFolder, noteText, readTemplate } from '../templates/notes';
import { formatDate } from '../templates/render';
import { formatAuthor, parseAuthors } from './authors';
import { allocatePath } from './plan';
import { vaultPathExists } from './notes';

export async function ensureAuthorNotes(
	app: App,
	config: QuestlineConfig,
	value: string,
	sourcePath: string,
): Promise<void> {
	const authors = parseAuthors(value).map((author) =>
		formatAuthor(author, false),
	);
	for (const author of authors) {
		await ensureAuthorNote(app, config, author, sourcePath);
	}
}

/**
 * Return the author note, creating it from the author template when the link
 * does not resolve. Returns null only when creation fails.
 */
export async function ensureAuthorNote(
	app: App,
	config: QuestlineConfig,
	rawAuthor: string,
	sourcePath: string,
): Promise<TFile | null> {
	const author = formatAuthor(rawAuthor, false);
	if (!author) return null;

	const existing = app.metadataCache.getFirstLinkpathDest(
		author,
		sourcePath,
	);
	if (existing instanceof TFile) return existing;

	const template = config.authorTemplate
		? await readTemplate(app, config.authorTemplate)
		: null;
	const now = new Date();
	const journal = collectJournalDates(app.vault, config, now);
	const folder = config.authorFolder;
	const path = allocatePath(folder, author, (candidate) =>
		vaultPathExists(app, candidate),
	);

	try {
		if (folder) await ensureVaultFolder(app, folder);

		const parts = composeNote({
			template,
			fallback: BUILTIN_AUTHOR,
			core: {
				created: journalDate(formatDate(now, 'YYYY-MM-DD'), journal),
			},
			values: { title: author },
			now,
		});

		return await app.vault.create(path, noteText(parts));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(
			`Questline could not create the author note ${author}: ${message}`,
		);

		return null;
	}
}
