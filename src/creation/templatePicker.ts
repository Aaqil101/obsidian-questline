/**
 * Template-note lookups for creation. A template note is a Markdown note
 * whose `type` is `questline-template`, the same marker the index skips.
 */
import {
	AbstractInputSuggest,
	FuzzySuggestModal,
	TFile,
	type App,
} from 'obsidian';
import { TEMPLATE_TYPE } from '../constants';

const SUGGEST_LIMIT = 50;

function typeOf(app: App, file: TFile): string | null {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;

	for (const [key, value] of Object.entries(frontmatter ?? {})) {
		if (key.toLowerCase() !== 'type' || typeof value !== 'string') continue;

		return value.trim().toLowerCase();
	}

	return null;
}

/** True when the note carries the marker that keeps it out of the index. */
export function isTemplateNote(app: App, file: TFile): boolean {
	return typeOf(app, file) === TEMPLATE_TYPE;
}

/** Every template note, sorted by path. */
export function templateNotes(app: App): TFile[] {
	return app.vault
		.getMarkdownFiles()
		.filter((file) => isTemplateNote(app, file))
		.sort((left, right) =>
			left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
		);
}

class TemplateSuggest extends AbstractInputSuggest<TFile> {
	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.onSelect((file) => {
			this.setValue(file.path);
			this.close();
		});
	}

	protected getSuggestions(query: string): TFile[] {
		const needle = query.trim().toLowerCase();

		return templateNotes(this.app)
			.filter((file) => !needle || file.path.toLowerCase().includes(needle))
			.slice(0, SUGGEST_LIMIT);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}
}

class TemplatePickModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly onPick: (path: string) => void,
	) {
		super(app);
		this.emptyStateText =
			'No template notes yet. Create one in your vault first.';
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.setPlaceholder('Find a template note.');
	}

	getItems(): TFile[] {
		return templateNotes(this.app);
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onPick(item.path);
	}
}

/** Attach template-only typeahead to an input. */
export function attachTemplateSuggest(
	app: App,
	inputEl: HTMLInputElement,
): void {
	new TemplateSuggest(app, inputEl);
}

/** Click-to-pick modal over every template note in the vault. */
export function pickTemplate(
	app: App,
	onPick: (path: string) => void,
): void {
	new TemplatePickModal(app, onPick).open();
}
