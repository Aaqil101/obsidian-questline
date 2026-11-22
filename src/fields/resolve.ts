import { asNumber, asTagList, asText, asTextList, normalizeTag } from './values';
import { parseLink, type ResolvedLink } from './wikilink';

export interface NoteSource {
	/** Vault-relative path, carried through for the index. */
	path: string;
	/** Parsed YAML frontmatter, if the note has any. */
	frontmatter?: Record<string, unknown> | null;
	/** Note body, including `%%` comments that hold the legacy inline fields. */
	body: string;
}

export interface ResolvedFields {
	path: string;
	tags: string[];
	isGoal: boolean;
	isProject: boolean;
	/** True when the note carries a project `status` or `Class: Project Class`. */
	hasProjectMarker: boolean;
	/** Goal category, falling back to the legacy `status` value. */
	category: string | null;
	status: string | null;
	/** `type` frontmatter, used to keep `questline-template` notes out of the index. */
	noteType: string | null;
	goal: ResolvedLink | null;
	projectTemplate: string | null;
	timespan: string | null;
	reason: string | null;
	authors: string[];
	subtitle: string | null;
	projectClass: string | null;
	created: string | null;
	aliases: string[];
	/** Manual progress fields; legacy Dataview expressions resolve to null. */
	progress: number | null;
	target: number | null;
	start: number | null;
}

const INLINE_FIELD = /^\s*(?:[-*+]\s+)?([A-Za-z][\w -]*?)\s*::\s*(.+?)\s*$/;
const FIELD_INNER = /^([A-Za-z][\w -]*?)\s*::\s*([\s\S]*)$/;
const BODY_TAG = /(?:^|[\s([{>])#([\p{L}\p{N}_/-]+)/gu;

/** Frontmatter keys are matched case-insensitively, so `Class` and `class` agree. */
function lookup(
	frontmatter: Record<string, unknown>,
	key: string,
): unknown {
	if (key in frontmatter) return frontmatter[key];

	const wanted = key.toLowerCase();
	for (const [name, value] of Object.entries(frontmatter)) {
		if (name.toLowerCase() === wanted) return value;
	}

	return undefined;
}

/** Index of the bracket that closes the one at `start`, or -1 when it never closes. */
function closingBracket(
	line: string,
	start: number,
	nested: boolean,
): number {
	let depth = 0;

	for (let index = start; index < line.length; index += 1) {
		const char = line[index];

		if (char === '[' || (nested && char === '(')) depth += 1;
		else if (char === ']' || (nested && char === ')')) depth -= 1;

		if (depth === 0) return index;
	}

	return -1;
}

/** Read `[key:: value]` and `(key:: value)` forms anywhere in the line. */
function parseBracketedFields(line: string, fields: Map<string, string>): void {
	for (let index = 0; index < line.length; index += 1) {
		const open = line[index];
		if (open !== '[' && open !== '(') continue;

		const end = closingBracket(line, index, open === '(');
		if (end < 0) continue;

		const match = FIELD_INNER.exec(line.slice(index + 1, end));
		if (match) {
			const [, key = '', value = ''] = match;
			const name = key.toLowerCase();
			if (!fields.has(name)) fields.set(name, value.trim());
			index = end;
		}
	}
}

/** Collect every inline field in the body. The first occurrence of a key wins. */
function parseInlineFields(body: string): Map<string, string> {
	const fields = new Map<string, string>();

	for (const line of body.split(/\r?\n/)) {
		const plain = INLINE_FIELD.exec(line);
		if (plain) {
			const [, key = '', value = ''] = plain;
			const name = key.toLowerCase();
			if (!fields.has(name)) fields.set(name, value);
		}

		parseBracketedFields(line, fields);
	}

	return fields;
}

/** Body hashtags, ignoring anything inside a fenced block or inline code. */
function bodyTags(body: string): string[] {
	const text = body
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/~~~[\s\S]*?~~~/g, ' ')
		.replace(/`[^`\n]*`/g, ' ');

	return [...text.matchAll(BODY_TAG)]
		.map((match) => match[1] ?? '')
		.filter((tag) => tag.length > 0)
		.map(normalizeTag);
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}

export function resolveNote(source: NoteSource): ResolvedFields {
	const frontmatter = source.frontmatter ?? {};
	const inline = parseInlineFields(source.body);

	/** Frontmatter wins, then the inline field, then nothing. */
	const text = (key: string): string | null =>
		asText(lookup(frontmatter, key)) ??
		asText(inline.get(key.toLowerCase()));

	const list = (keys: string[]): string[] => {
		for (const key of keys) {
			const values = asTextList(lookup(frontmatter, key));
			if (values.length > 0) return values;
		}

		for (const key of keys) {
			const values = asTextList(inline.get(key.toLowerCase()));
			if (values.length > 0) return values;
		}

		return [];
	};

	const tags = unique([
		...asTagList(lookup(frontmatter, 'tags') ?? lookup(frontmatter, 'tag')),
		...asTagList(inline.get('tags') ?? inline.get('tag')),
		...bodyTags(source.body),
	]);

	const status = text('status');
	const projectClass = text('class');
	const templateText = text('project_template');
	const goalText = text('goal');
	const isGoal = tags.includes('goal');
	const numbers = (key: string): number | null =>
		asNumber(lookup(frontmatter, key)) ?? asNumber(inline.get(key.toLowerCase()));

	return {
		path: source.path,
		tags,
		isGoal,
		isProject: tags.includes('project'),
		hasProjectMarker:
			status !== null ||
			projectClass?.toLowerCase() === 'project class',
		// A goal's category is the legacy status; a project's status is not one.
		category: text('category') ?? (isGoal ? status : null),
		status,
		noteType: text('type'),
		goal: goalText ? parseLink(goalText) : null,
		projectTemplate: templateText
			? (parseLink(templateText)?.target ?? null)
			: null,
		timespan: text('timespan'),
		reason: text('reason'),
		authors: list(['author', 'authors']).map(
			(author) => parseLink(author)?.target ?? author,
		),
		subtitle: text('subtitle'),
		projectClass,
		created: text('created'),
		aliases: list(['aliases', 'alias']),
		progress: numbers('progress'),
		target: numbers('target'),
		start: numbers('start'),
	};
}
