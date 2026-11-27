/** Edit an existing goal's frontmatter and title. */
import {
	Modal,
	Notice,
	Setting,
	type App,
	type TextAreaComponent,
	type TextComponent,
} from 'obsidian';
import type { GoalNode } from '../index/types';
import type { QuestlineConfig } from '../settings/types';
import { goalEditDraft, type GoalEditDraft } from './edit';
import { validateGoalEdit, type GoalField } from './validate';

const TIMESPAN_SUGGESTIONS = [
	'1 Month',
	'3 Months',
	'6 Months',
	'1 Year',
	'Infinite',
];

interface GoalInputs {
	title?: TextComponent;
	reason?: TextAreaComponent;
}

export class EditGoalModal extends Modal {
	constructor(
		app: App,
		private readonly config: QuestlineConfig,
		private readonly goal: GoalNode,
		private readonly onSave: (draft: GoalEditDraft) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		const draft = goalEditDraft(this.goal);
		contentEl.empty();
		this.setTitle('Edit goal');
		this.modalEl.addClass('questline-modal');

		const inputs: GoalInputs = {};
		let category = draft.category;
		let timespan = draft.timespan;
		let timespanInput: HTMLSelectElement | null = null;

		new Setting(contentEl)
			.setName('Title')
			.setDesc(
				'Changing the title renames the note in its current folder.',
			)
			.addText((text) => {
				inputs.title = text;
				text.setValue(draft.title);
			});

		new Setting(contentEl)
			.setName('Category')
			.setDesc('Choose a category, or leave it without one.')
			.addDropdown((dropdown) => {
				const options = [...this.config.goalCategories];
				if (
					category &&
					!options.some(
						(option) =>
							option.toLowerCase() === category.toLowerCase(),
					)
				) {
					options.push(category);
				}

				dropdown.addOption('', 'No category');
				for (const option of options) {
					dropdown.addOption(option, option);
				}

				dropdown.setValue(category).onChange((value) => {
					category = value;
				});
			});

		const reasonSetting = new Setting(contentEl)
			.setName('Reason')
			.setDesc('Optional. Why does this goal matter?')
			.addTextArea((text) => {
				inputs.reason = text;
				text.setValue(draft.reason);
				text.inputEl.rows = 9;
			});
		reasonSetting.settingEl.addClass('questline-reason-setting');

		new Setting(contentEl)
			.setName('Timespan')
			.setDesc('Optional. A due date is measured from today.')
			.addDropdown((dropdown) => {
				const options = [...TIMESPAN_SUGGESTIONS];
				if (
					timespan &&
					!options.some(
						(option) =>
							option.toLowerCase() === timespan.toLowerCase(),
					)
				) {
					options.push(timespan);
				}

				dropdown.addOption('', 'No timespan');
				for (const option of options) {
					dropdown.addOption(option, option);
				}

				timespanInput = dropdown.selectEl;
				dropdown.setValue(timespan).onChange((value) => {
					timespan = value;
				});
			});

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText('Save changes')
					.setCta()
					.onClick(() =>
						this.submit(inputs, category, timespan, timespanInput),
					),
			);

		inputs.title?.inputEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(
		inputs: GoalInputs,
		category: string,
		timespan: string,
		timespanInput: HTMLSelectElement | null,
	): void {
		const draft: GoalEditDraft = {
			title: inputs.title?.getValue() ?? '',
			category,
			reason: inputs.reason?.getValue() ?? '',
			timespan,
		};

		const problem = validateGoalEdit(draft);
		if (problem) {
			new Notice(problem.message);
			this.focus(problem.field, inputs, timespanInput);

			return;
		}

		this.close();
		this.onSave(draft);
	}

	private focus(
		field: GoalField,
		inputs: GoalInputs,
		timespanInput: HTMLSelectElement | null,
	): void {
		if (field === 'timespan') {
			timespanInput?.focus();

			return;
		}

		inputs.title?.inputEl.focus();
	}
}
