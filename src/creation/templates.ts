/** Template precedence for project creation: goal, global, then built-in. */
import { Notice, type App } from 'obsidian';
import type { QuestlineConfig } from '../settings/types';
import type { TemplateDocument } from '../templates/document';
import { findTemplateFile, readTemplateFile } from '../templates/notes';

export interface TemplateResolution {
	document: TemplateDocument | null;
	/** True when the chosen or linked template no longer exists. */
	missing: boolean;
}

export function goalTemplatePath(
	app: App,
	target: string | null | undefined,
): { path: string; missing: boolean } {
	if (!target?.trim()) return { path: '', missing: false };

	const file = findTemplateFile(app, target);

	return file ? { path: file.path, missing: false } : { path: '', missing: true };
}

/**
 * What the template field starts on: the goal's own template when it still
 * resolves, then the global template, then blank for the built-in body.
 */
export function defaultProjectTemplatePath(
	app: App,
	config: QuestlineConfig,
	goalTarget: string | null | undefined,
): string {
	const goal = goalTemplatePath(app, goalTarget);
	if (goal.path) return goal.path;

	return findTemplateFile(app, config.projectTemplate)?.path ?? '';
}

/**
 * Read the template the user left in the field. A path that no longer
 * resolves falls back to the global template, or the built-in body when
 * there is no global one.
 */
export async function readChosenProjectTemplate(
	app: App,
	config: QuestlineConfig,
	chosenPath: string,
): Promise<TemplateResolution> {
	const path = chosenPath.trim();
	if (!path) return { document: null, missing: false };

	const file = findTemplateFile(app, path);
	if (file) {
		return { document: await readTemplateFile(app, file), missing: false };
	}

	const global = findTemplateFile(app, config.projectTemplate);

	return {
		document: global ? await readTemplateFile(app, global) : null,
		missing: true,
	};
}

/** Warn that a linked or typed template is gone and what happens instead. */
export function announceMissingTemplate(target: string): void {
	new Notice(
		`The template "${target}" is missing. Questline used the global project template instead.`,
	);
}
