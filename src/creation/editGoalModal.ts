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
import { ValueSuggest } from './suggest';
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
	category?: TextComponent;
	reason?: TextAreaComponent;
	timespan?: TextComponent;
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
			.setDesc('Suggestions come from the goal categories.')
			.addText((text) => {
				inputs.category = text;
				text.setValue(draft.category);
				new ValueSuggest(
					this.app,
					text.inputEl,
					this.config.goalCategories,
				);
			});

		new Setting(contentEl)
			.setName('Reason')
			.setDesc('Optional. Why does this goal matter?')
			.addTextArea((text) => {
				inputs.reason = text;
				text.setValue(draft.reason);
				text.inputEl.rows = 9;
			});

		new Setting(contentEl)
			.setName('Timespan')
			.setDesc('Optional. A due date is measured from today.')
			.addText((text) => {
				inputs.timespan = text;
				text.setValue(draft.timespan);
				new ValueSuggest(this.app, text.inputEl, TIMESPAN_SUGGESTIONS);
			});

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText('Save changes')
					.setCta()
					.onClick(() => this.submit(inputs)),
			);

		inputs.title?.inputEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(inputs: GoalInputs): void {
		const draft: GoalEditDraft = {
			title: inputs.title?.getValue() ?? '',
			category: inputs.category?.getValue() ?? '',
			reason: inputs.reason?.getValue() ?? '',
			timespan: inputs.timespan?.getValue() ?? '',
		};

		const problem = validateGoalEdit(draft);
		if (problem) {
			new Notice(problem.message);
			this.focus(problem.field, inputs);

			return;
		}

		this.close();
		this.onSave(draft);
	}

	private focus(field: GoalField, inputs: GoalInputs): void {
		const input =
			field === 'title'
				? inputs.title
				: field === 'timespan'
					? inputs.timespan
					: undefined;

		input?.inputEl.focus();
	}
}
