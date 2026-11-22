import {
	AbstractInputSuggest,
	FuzzySuggestModal,
	TFolder,
	type App,
	type Setting,
	type TextComponent,
} from 'obsidian';

/** How many folders the typeahead offers before it stops matching. */
const SUGGEST_LIMIT = 50;

/** The vault root, spelled the way Obsidian reports it. */
const ROOT_PATH = '/';

/** Every folder in the vault, root first, so the list is stable and sorted. */
function vaultFolders(app: App): TFolder[] {
	const folders: TFolder[] = [];
	const walk = (folder: TFolder): void => {
		folders.push(folder);
		for (const child of folder.children) {
			if (child instanceof TFolder) walk(child);
		}
	};

	walk(app.vault.getRoot());

	return folders.sort((left, right) => left.path.localeCompare(right.path));
}

/** Popover suggestions while a folder row is being typed into. */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		// Fill the box only: the path is still committed on blur, so a
		// suggestion can be edited into a deeper folder before anything is
		// stored.
		this.onSelect((folder) => {
			this.setValue(folder.path);
			this.close();
		});
	}

	protected getSuggestions(query: string): TFolder[] {
		const needle = query.trim().replace(/^\/+/, '').toLowerCase();

		return vaultFolders(this.app)
			.filter(
				(folder) =>
					!needle || folder.path.toLowerCase().includes(needle),
			)
			.slice(0, SUGGEST_LIMIT);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}
}

/** Click-to-pick modal over every folder in the vault. */
export class FolderPickModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly onPick: (path: string) => void,
	) {
		super(app);
		this.emptyStateText = 'No folder matches that.';
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.setPlaceholder('Jump to a folder…');
	}

	getItems(): TFolder[] {
		return vaultFolders(this.app);
	}

	getItemText(item: TFolder): string {
		return item.path;
	}

	onChooseItem(item: TFolder): void {
		this.onPick(item.path === ROOT_PATH ? '' : item.path);
	}
}

export interface FolderRowOptions {
	app: App;
	/** Stored value; the box starts here. */
	value: string;
	/** Shown in the box while it is empty, so the row never looks unset. */
	placeholder: string;
	/** Turn what was typed into the canonical stored path. */
	normalize: (raw: string) => string;
	/** Store the normalized path, and do whatever moving it implies. */
	commit: (path: string) => void | Promise<void>;
}

/**
 * One folder row: a text input with typeahead and a browse button. The value
 * commits on blur or Enter (or right after a browse pick), so a half-typed
 * path never reaches the index or creation.
 */
export function folderSetting(
	row: Setting,
	options: FolderRowOptions,
): void {
	let committed = options.value;
	let input: TextComponent | null = null;

	const commit = (): Promise<void> => {
		if (!input) return Promise.resolve();

		const next = options.normalize(input.getValue());
		input.setValue(next);
		if (next === committed) return Promise.resolve();

		committed = next;

		return Promise.resolve(options.commit(next));
	};

	row.addText((text) => {
		input = text;
		text.setPlaceholder(options.placeholder).setValue(options.value);
		text.inputEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') text.inputEl.blur();
		});
		text.inputEl.addEventListener('blur', () => {
			void commit();
		});
		new FolderSuggest(options.app, text.inputEl);
	});

	row.addExtraButton((button) =>
		button.setIcon('folder').setTooltip('Browse folders').onClick(() => {
			if (!input) return;

			new FolderPickModal(options.app, (path) => {
				if (!input) return;
				input.setValue(path);
				void commit();
			}).open();
		}),
	);
}
