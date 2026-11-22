/** Small frontmatter edits that keep the user's key casing intact. */
import type { App, TFile } from 'obsidian';

function findKey(
	frontmatter: Record<string, unknown>,
	key: string,
): string | undefined {
	const wanted = key.toLowerCase();

	return Object.keys(frontmatter).find((name) => name.toLowerCase() === wanted);
}

/** Set a key, replacing a differently cased key instead of duplicating it. */
export function setFrontmatterKey(
	frontmatter: Record<string, unknown>,
	key: string,
	value: unknown,
): void {
	const existing = findKey(frontmatter, key);
	if (existing !== undefined && existing !== key) delete frontmatter[existing];

	frontmatter[key] = value;
}

/** Remove a key, whatever its casing. */
export function removeFrontmatterKey(
	frontmatter: Record<string, unknown>,
	key: string,
): void {
	const existing = findKey(frontmatter, key);
	if (existing !== undefined) delete frontmatter[existing];
}

/**
 * Edit one note's frontmatter through the file manager, so the body and the
 * metadata cache stay in sync.
 */
export async function editFrontmatter(
	app: App,
	file: TFile,
	edit: (frontmatter: Record<string, unknown>) => void,
): Promise<void> {
	await app.fileManager.processFrontMatter(
		file,
		(frontmatter: Record<string, unknown>) => {
			edit(frontmatter);
		},
	);
}
