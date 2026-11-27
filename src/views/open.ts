/** Open a note from a block or a view, reusing an already open tab. */
import { MarkdownView, type App, type WorkspaceLeaf } from 'obsidian';

function findMarkdownLeaf(app: App, path: string): WorkspaceLeaf | null {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file?.path === path) {
			return leaf;
		}

		const state = leaf.getViewState();
		if (state.type === 'markdown' && state.state?.file === path) {
			return leaf;
		}
	}

	return null;
}

/** Reveal an open note tab, or open the note in a new tab. */
export function revealOrOpen(
	app: App,
	path: string,
	event: Event,
	sourcePath = '',
): void {
	event.preventDefault();

	const leaf = findMarkdownLeaf(app, path);
	if (leaf) {
		void app.workspace.revealLeaf(leaf);

		return;
	}

	void app.workspace.openLinkText(path, sourcePath, 'tab');
}

/** Reveal an open note, or open it without an event (menus and actions). */
export function openOrReveal(
	app: App,
	path: string,
	newLeaf = false,
): void {
	const leaf = findMarkdownLeaf(app, path);
	if (leaf) {
		void app.workspace.revealLeaf(leaf);

		return;
	}

	void app.workspace.openLinkText(path, '', newLeaf ? 'tab' : false);
}
