/** Display names derived from note filenames. */
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}\s*[-–—:|]\s*/;

/** A note name without a leading date from the default goal pattern. */
export function withoutDate(name: string): string {
	return name.replace(DATE_PREFIX, '').trim() || name;
}

/**
 * A goal's display name: its first alias, otherwise the note name with a
 * leading date removed.
 */
export function goalTitle(
	name: string,
	aliases: readonly string[] = [],
): string {
	return aliases[0]?.trim() || withoutDate(name);
}
