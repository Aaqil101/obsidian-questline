/** Obsidian glue for writing a creation plan and opening the new note. */
import { TFile, TFolder, normalizePath, type App } from 'obsidian';
import { ensureVaultFolder, noteText } from '../templates/notes';
import type { CreationPlan } from './plan';

function folderOf(path: string): string {
	const slash = path.lastIndexOf('/');

	return slash < 0 ? '' : path.slice(0, slash);
}

function parentFolder(app: App, path: string): TFolder | null {
	const folder = folderOf(path);
	const entry = folder
		? app.vault.getAbstractFileByPath(folder)
		: app.vault.getRoot();

	return entry instanceof TFolder ? entry : null;
}

/**
 * A case-insensitive path check. Obsidian treats vault paths as
 * case-insensitive on some platforms, so a differently cased name must still
 * count as taken.
 */
export function vaultPathExists(app: App, rawPath: string): boolean {
	const path = normalizePath(rawPath);
	if (app.vault.getAbstractFileByPath(path)) return true;

	const parent = parentFolder(app, path);
	if (!parent) return false;

	const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();

	return parent.children.some((child) => child.name.toLowerCase() === name);
}

/**
 * Write a plan. The custom template is written first so the new goal can
 * link to it; if the goal write fails, the template is removed again so a
 * failed creation leaves no trace.
 */
export async function writeCreation(
	app: App,
	plan: CreationPlan,
): Promise<TFile> {
	const goalFolder = folderOf(plan.path);
	if (goalFolder) await ensureVaultFolder(app, goalFolder);

	let templateFile: TFile | null = null;
	if (plan.template) {
		const templateFolder = folderOf(plan.template.path);
		if (templateFolder) await ensureVaultFolder(app, templateFolder);

		templateFile = await app.vault.create(
			plan.template.path,
			noteText(plan.template.parts),
		);
	}

	try {
		return await app.vault.create(plan.path, noteText(plan.note));
	} catch (error) {
		if (templateFile) {
			try {
				await app.fileManager.trashFile(templateFile);
			} catch {
				// The best effort is enough: the original error is the one
				// the user needs to see.
			}
		}

		throw error;
	}
}

/** Open a note in its own tab. */
export async function openNote(app: App, file: TFile): Promise<void> {
	await app.workspace.getLeaf('tab').openFile(file);
}
