/**
 * Template documents and note composition. The plugin owns a small set of
 * frontmatter keys (tags, created, goal, status, and the rest of creation's
 * core), so a template can add its own keys but never override those.
 */
import { TEMPLATE_TYPE } from '../constants';
import { renderTokens, type TemplateValues } from './render';

export interface TemplateDocument {
	frontmatter: Record<string, unknown> | null;
	body: string;
}

export interface NoteParts {
	frontmatter: Record<string, unknown>;
	body: string;
}

/** An empty frontmatter block is allowed, so the group is optional. */
const FRONTMATTER =
	/^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/**
 * Split a note into raw frontmatter text and body. When there is no
 * frontmatter the whole note is the body, including a leading `---` that
 * never closes.
 */
export function splitFrontmatter(text: string): {
	frontmatter: string | null;
	body: string;
} {
	const match = FRONTMATTER.exec(text);
	if (!match) return { frontmatter: null, body: text };

	return {
		frontmatter: match[1] ?? '',
		body: text.slice(match[0].length),
	};
}

/** The key that already holds `name`, ignoring case, or undefined. */
function matchingKey(
	target: Record<string, unknown>,
	name: string,
): string | undefined {
	const wanted = name.toLowerCase();

	return Object.keys(target).find((key) => key.toLowerCase() === wanted);
}

function isTemplateType(value: unknown): boolean {
	return (
		typeof value === 'string' &&
		value.trim().toLowerCase() === TEMPLATE_TYPE
	);
}

/** Tags from a scalar, a comma-separated scalar, or a list. Hashes go away. */
function tagList(value: unknown): string[] {
	const tags: string[] = [];

	for (const item of Array.isArray(value) ? value : [value]) {
		if (typeof item !== 'string') continue;

		for (const part of item.split(',')) {
			const tag = part.trim().replace(/^#+\s*/, '');
			if (tag) tags.push(tag);
		}
	}

	return tags;
}

/** Core tags come first; a template may add tags of its own. */
function mergeTags(coreValue: unknown, templateValue: unknown): string[] {
	const seen = new Set<string>();
	const tags: string[] = [];

	for (const tag of [...tagList(coreValue), ...tagList(templateValue)]) {
		const key = tag.toLowerCase();
		if (seen.has(key)) continue;

		seen.add(key);
		tags.push(tag);
	}

	return tags;
}

/**
 * Merge a template's frontmatter under the core keys. Template keys survive
 * unless creation sets them, keys are compared case-insensitively, tags are
 * unioned, and the template marker itself is never copied into a new note.
 */
export function mergeFrontmatter(
	core: Record<string, unknown>,
	template: Record<string, unknown> | null,
): Record<string, unknown> {
	const merged: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(template ?? {})) {
		if (key.toLowerCase() === 'type' && isTemplateType(value)) continue;
		merged[key] = value;
	}

	for (const [key, value] of Object.entries(core)) {
		const existing = matchingKey(merged, key);

		if (key.toLowerCase() === 'tags') {
			merged[key] = mergeTags(
				value,
				existing === undefined ? undefined : merged[existing],
			);
		} else {
			merged[key] = value;
		}

		if (existing !== undefined && existing !== key) delete merged[existing];
	}

	return merged;
}

/** Tokens also render inside template frontmatter, such as an alias. */
function renderValue(
	value: unknown,
	values: TemplateValues,
	now: Date,
): unknown {
	if (typeof value === 'string') return renderTokens(value, values, now);
	if (Array.isArray(value)) {
		return value.map((item) => renderValue(item, values, now));
	}
	if (value && typeof value === 'object' && !(value instanceof Date)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				renderValue(item, values, now),
			]),
		);
	}

	return value;
}

export interface ComposeOptions {
	/** The template the user picked, or null when none is configured. */
	template: TemplateDocument | null;
	/** The built-in body used when there is no template. */
	fallback: TemplateDocument;
	/** Frontmatter Questline owns. These keys always win. */
	core: Record<string, unknown>;
	values: TemplateValues;
	now?: Date;
}

/**
 * Build a note from a template, or from the built-in fallback when no
 * template is configured. A template with an empty body stays empty: the
 * fallback is for a missing template, not for a deliberately blank one.
 */
export function composeNote(options: ComposeOptions): NoteParts {
	const now = options.now ?? new Date();
	const source = options.template ?? options.fallback;
	const templateFrontmatter = options.template?.frontmatter ?? null;

	const frontmatter =
		templateFrontmatter === null
			? null
			: (renderValue(
					templateFrontmatter,
					options.values,
					now,
				) as Record<string, unknown>);

	return {
		frontmatter: mergeFrontmatter(options.core, frontmatter),
		body: renderTokens(source.body, options.values, now).trim(),
	};
}
