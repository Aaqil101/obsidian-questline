/** Author parsing, wikilink formatting, and known-author merging. */

/** Authors are entered comma-separated: one name or many. */
export function parseAuthors(value: string): string[] {
	const authors: string[] = [];
	const seen = new Set<string>();

	for (const part of value.split(',')) {
		const text = part.trim();
		const key = text.toLowerCase();
		if (!text || seen.has(key)) continue;

		seen.add(key);
		authors.push(text);
	}

	return authors;
}

/** Strip a wikilink wrapper so a typed `[[Name]]` is not wrapped twice. */
function authorName(author: string): string {
	const text = author.trim();
	const match = /^\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]$/.exec(text);

	return (match?.[1] ?? text).trim();
}

export function formatAuthor(author: string, wikilink: boolean): string {
	const name = authorName(author);

	return wikilink ? `[[${name}]]` : name;
}

export function formatAuthors(
	value: string,
	wikilink: boolean,
): string[] {
	return parseAuthors(value).map((author) =>
		formatAuthor(author, wikilink),
	);
}

/** The `author` frontmatter value, or null when there are no authors. */
export function authorField(
	value: string,
	wikilink: boolean,
): string | string[] | null {
	const authors = formatAuthors(value, wikilink);
	if (authors.length === 0) return null;

	return authors.length === 1 ? (authors[0] ?? null) : authors;
}

/** Add new names to the known-author list without changing existing casing. */
export function mergeAuthors(
	existing: readonly string[],
	incoming: readonly string[],
): string[] {
	const authors = [...existing];
	const seen = new Set(existing.map((author) => author.toLowerCase()));

	for (const name of incoming) {
		const text = name.trim();
		const key = text.toLowerCase();
		if (!text || seen.has(key)) continue;

		seen.add(key);
		authors.push(text);
	}

	return authors;
}
