const EXPRESSION = /^`[$=]/;

/** Legacy P&Q fields hold Dataview expressions; they are data about the vault, not about the note. */
export function isExpression(value: string): boolean {
	return EXPRESSION.test(value.trim());
}

/** Coerce a frontmatter or inline value to text, or null when it holds nothing usable. */
export function asText(value: unknown): string | null {
	if (value === null || value === undefined) return null;

	if (typeof value === 'string') {
		const text = value.trim();
		return text && !isExpression(text) ? text : null;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	// A YAML parser may hand back a real date for an unquoted `created`.
	if (value instanceof Date) {
		return value.toISOString();
	}

	return null;
}

/** Coerce a value to a list of non-empty strings. Scalars become one-item lists. */
export function asTextList(value: unknown): string[] {
	const values: string[] = [];

	for (const item of Array.isArray(value) ? value : [value]) {
		const text = asText(item);
		if (text) values.push(text);
	}

	return values;
}

/** Tags are case-insensitive and are stored without their leading hash. */
export function normalizeTag(tag: string): string {
	return tag.replace(/^#+/, '').trim().toLowerCase();
}

/**
 * Coerce a `tags` value to normalized tags. Hashtags win when present, because
 * a Dataview tags field mixes links (`tags:: #project, [[Python]]`) with the
 * tag itself; a plain scalar still splits on commas.
 */
export function asTagList(value: unknown): string[] {
	const tags: string[] = [];

	for (const item of Array.isArray(value) ? value : [value]) {
		const text = asText(item);
		if (!text) continue;

		const hashtags = [...text.matchAll(/#([\p{L}\p{N}_/-]+)/gu)]
			.map((match) => match[1] ?? '')
			.filter((tag) => tag.length > 0);

		tags.push(
			...(hashtags.length > 0
				? hashtags
				: text
						.split(',')
						.map((part) => part.trim())
						.filter((part) => part && !part.startsWith('[['))),
		);
	}

	return tags.map(normalizeTag).filter((tag) => tag.length > 0);
}
