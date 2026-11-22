/**
 * Obsidian glue for templates: reading a template note, turning parts into
 * note text, and writing the editable starter templates.
 */
import {
	Notice,
	TFile,
	TFolder,
	normalizePath,
	parseYaml,
	stringifyYaml,
	type App,
} from 'obsidian';
import type { QuestlineConfig } from '../settings/types';
import { STARTER_TEMPLATES } from './builtin';
import {
	splitFrontmatter,
	type NoteParts,
	type TemplateDocument,
} from './document';
import { describeStarterResult, type StarterResult } from './starter';

/** Vault path of a template note, with the extension Obsidian looks for. */
export function templateNotePath(value: string): string {
	const path = value.trim().replace(/\\/g, '/');
	if (!path) return '';

	return normalizePath(/\.md$/i.test(path) ? path : `${path}.md`);
}

function parseTemplateFrontmatter(
	yaml: string,
): Record<string, unknown> | null {
	if (!yaml.trim()) return null;

	try {
		const value = parseYaml(yaml) as unknown;
		return value && typeof value === 'object'
			? (value as Record<string, unknown>)
			: null;
	} catch {
		// A malformed template must not stop creation; it simply adds nothing.
		return null;
	}
}

/** Read one template note. A missing note is no template at all. */
export async function readTemplate(
	app: App,
	path: string,
): Promise<TemplateDocument | null> {
	const target = templateNotePath(path);
	if (!target) return null;

	const file = app.vault.getAbstractFileByPath(target);
	if (!(file instanceof TFile) || file.extension !== 'md') return null;

	const text = await app.vault.cachedRead(file);
	const { frontmatter, body } = splitFrontmatter(text);

	return { frontmatter: parseTemplateFrontmatter(frontmatter ?? ''), body };
}

/** Note text with frontmatter first, then a blank line and the body. */
export function noteText(parts: NoteParts): string {
	const yaml = stringifyYaml(parts.frontmatter).trimEnd();
	const body = parts.body.trim();

	if (!yaml) return body ? `${body}\n` : '';

	return body ? `---\n${yaml}\n---\n\n${body}\n` : `---\n${yaml}\n---\n`;
}

function joinPath(folder: string, fileName: string): string {
	return folder ? `${folder}/${fileName}` : fileName;
}

/** Create a folder and its parents, and refuse a note sitting on the path. */
async function ensureFolder(app: App, path: string): Promise<string> {
	if (!path) return '';

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFolder) return path;
	if (existing) {
		throw new Error(`A note already uses the template folder path: ${path}`);
	}

	const slash = path.lastIndexOf('/');
	await ensureFolder(app, slash < 0 ? '' : path.slice(0, slash));

	try {
		await app.vault.createFolder(path);
	} catch (error) {
		// A vault event may have created it between the check and the call.
		if (!(app.vault.getAbstractFileByPath(path) instanceof TFolder)) {
			throw error;
		}
	}

	return path;
}

/**
 * Write the editable starter templates into the template folder. Existing
 * files are never overwritten, because the user may already have edited them.
 * A blank folder is refused: the starter files need a place the user picked,
 * not the vault root.
 */
export async function createStarterTemplates(
	app: App,
	config: QuestlineConfig,
): Promise<StarterResult> {
	if (!config.templateFolder) {
		return { created: [], existing: [], folderMissing: true };
	}

	const folder = await ensureFolder(app, config.templateFolder);
	const result: StarterResult = {
		created: [],
		existing: [],
		folderMissing: false,
	};

	for (const starter of STARTER_TEMPLATES) {
		const path = normalizePath(joinPath(folder, `${starter.fileName}.md`));

		if (app.vault.getAbstractFileByPath(path)) {
			result.existing.push(path);
			continue;
		}

		await app.vault.create(
			path,
			noteText({
				frontmatter: starter.document.frontmatter ?? {},
				body: starter.document.body,
			}),
		);
		result.created.push(path);
	}

	return result;
}

/** Shared command body, so the settings button and the command agree. */
export function announceStarterResult(result: StarterResult): void {
	new Notice(describeStarterResult(result));
}

/** Failure copy for the command and the settings button. */
export function announceStarterError(error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	new Notice(`Questline could not create the starter templates: ${message}`);
}
