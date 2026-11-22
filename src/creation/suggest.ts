/** Typeahead over a fixed list of strings, used for categories and spans. */
import { AbstractInputSuggest, type App } from 'obsidian';

const SUGGEST_LIMIT = 50;

export class ValueSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly values: readonly string[],
	) {
		super(app, inputEl);
		this.onSelect((value) => {
			this.setValue(value);
			this.close();
		});
	}

	protected getSuggestions(query: string): string[] {
		const needle = query.trim().toLowerCase();

		return this.values
			.filter((value) => !needle || value.toLowerCase().includes(needle))
			.slice(0, SUGGEST_LIMIT);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}
}
