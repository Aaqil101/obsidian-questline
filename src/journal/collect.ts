/** Read the journal folder's daily-note names for date linking. */
import { TFile, TFolder, type Vault } from 'obsidian';
import type { QuestlineConfig } from '../settings/types';
import { normalizeFolder } from '../settings/types';
import { isoDate, type JournalDates } from './dates';

function collectNames(folder: TFolder, names: Set<string>): void {
	for (const child of folder.children) {
		if (child instanceof TFile) {
			if (child.extension === 'md') names.add(child.basename);
			continue;
		}

		if (child instanceof TFolder) collectNames(child, names);
	}
}

/**
 * Undefined means no journal folder is configured, so dates stay plain.
 * Notes are matched anywhere under the folder, including year/month layouts.
 */
export function collectJournalDates(
	vault: Vault,
	config: QuestlineConfig,
	now: Date = new Date(),
): JournalDates | undefined {
	const path = normalizeFolder(config.journalFolder);
	if (!path) return undefined;

	const folder = vault.getAbstractFileByPath(path);
	if (!(folder instanceof TFolder)) return undefined;

	const names = new Set<string>();
	collectNames(folder, names);

	return { names, today: isoDate(now) };
}
