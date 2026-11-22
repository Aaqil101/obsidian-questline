import { Setting, type TextComponent } from 'obsidian';
import { group, noteParagraph } from './ui';

export interface ListEditorOptions {
	containerEl: HTMLElement;
	name: string;
	desc: string;
	values: readonly string[];
	placeholder: string;
	onChange: (values: string[]) => void | Promise<void>;
}

function withValue(values: readonly string[], value: string): string | null {
	const text = value.trim();
	if (!text) return null;

	const exists = values.some(
		(candidate) => candidate.toLowerCase() === text.toLowerCase(),
	);

	return exists ? null : text;
}

/**
 * An editable list card: a heading, a one-line description, one text row per
 * value with a remove button, and an add row. Rows are added and removed in
 * place, so editing one value never re-renders the whole tab.
 */
export function renderListEditor(options: ListEditorOptions): void {
	const { containerEl, onChange } = options;
	const values = [...options.values];

	const card = group(containerEl, options.name);
	noteParagraph(card, options.desc);

	const addSetting = new Setting(card);
	addSetting.setClass('questline-list-item');
	addSetting.setClass('questline-list-add');

	const addRow = (value: string): void => {
		const row = new Setting(card);
		row.setClass('questline-list-item');

		if (addSetting.settingEl.parentElement) {
			addSetting.settingEl.before(row.settingEl);
		}

		// The row owns its current value, so editing it twice keeps its place
		// in the list instead of restoring the value it started with.
		let current = value;

		row.addText((text) =>
			text.setValue(value).onChange(async (next) => {
				const index = values.indexOf(current);
				if (index < 0) return;

				values[index] = next;
				current = next;
				await onChange([...values]);
			}),
		);
		row.addExtraButton((button) =>
			button
				.setIcon('trash')
				.setTooltip('Remove')
				.onClick(async () => {
					const index = values.indexOf(current);
					if (index >= 0) values.splice(index, 1);

					row.settingEl.remove();
					await onChange([...values]);
				}),
		);
	};

	for (const value of values) addRow(value);

	let entry: TextComponent | null = null;

	const add = (): void => {
		if (!entry) return;

		const value = withValue(values, entry.getValue());
		if (!value) return;

		values.push(value);
		entry.setValue('');
		addRow(value);
		void Promise.resolve(onChange([...values]));
	};

	addSetting.addText((text) => {
		entry = text;
		text.setPlaceholder(options.placeholder);
		text.inputEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				add();
			}
		});
	});

	addSetting.addButton((button) =>
		button.setButtonText('Add').onClick(() => add()),
	);
}
