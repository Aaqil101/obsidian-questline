/** Journal-aware date formatting: link a date only when its daily note can open. */
export interface JournalDates {
	/** Base names of the markdown notes under the journal folder. */
	names: ReadonlySet<string>;
	/** Today's ISO date, so today and later always link. */
	today: string;
}

/** A local YYYY-MM-DD date, matching the daily-note names. */
export function isoDate(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');

	return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * `[[YYYY-MM-DD]]` when the day's note exists, or when the date is today or
 * later; plain ISO text otherwise, and always plain with no journal folder.
 */
export function journalDate(
	value: string,
	journal: JournalDates | undefined,
): string {
	if (!journal) return value;

	const date = value.trim();
	if (!date) return value;

	if (date >= journal.today || journal.names.has(date)) {
		return `[[${date}]]`;
	}

	return value;
}
