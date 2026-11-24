/** The New goal modal. Nothing is written until the user submits. */
import {
	Modal,
	Notice,
	Setting,
	type App,
	type TextAreaComponent,
	type TextComponent,
} from 'obsidian';
import { attachFolderSuggest, FolderPickModal } from '../settings/folderPicker';
import type { QuestlineConfig } from '../settings/types';
import { findTemplateFile } from '../templates/notes';
import { isTimekeepInstalled } from '../timekeep/timekeep';
import type { GoalDraft, GoalTemplateMode } from './plan';
import { ValueSuggest } from './suggest';
import {
	attachTemplateSuggest,
	isTemplateNote,
	pickTemplate,
} from './templatePicker';
import { validateGoal, type GoalField } from './validate';

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
	folder?: TextComponent;
	templatePath?: TextComponent;
}

export class GoalModal extends Modal {
	constructor(
		app: App,
		private readonly config: QuestlineConfig,
		private readonly onCreate: (draft: GoalDraft) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle('New goal');
		this.modalEl.addClass('questline-modal');

		const inputs: GoalInputs = {};
		let templateMode: GoalTemplateMode = 'custom';
		let existingTemplateRow: Setting | null = null;
		let includeProgress = true;
		let includeTimekeep = false;
		const timekeepAvailable = isTimekeepInstalled(this.app);

		const titleSetting = new Setting(contentEl)
			.setName('Title')
			.setDesc('Required. The goal name, used for the note and its filename.')
			.addText((text) => {
				inputs.title = text;
				text.setPlaceholder('What do you want to achieve?');
			});
		titleSetting.settingEl.addClass('questline-title-setting');

		new Setting(contentEl)
			.setName('Category')
			.setDesc('Required. Suggestions come from the goal categories.')
			.addText((text) => {
				inputs.category = text;
				text.setPlaceholder('Learning');
				new ValueSuggest(
					this.app,
					text.inputEl,
					this.config.goalCategories,
				);
			});

		const reasonSetting = new Setting(contentEl)
			.setName('Reason')
			.setDesc('Required. Why does this goal matter?')
			.addTextArea((text) => {
				inputs.reason = text;
				text.setPlaceholder('What this goal changes');
				text.inputEl.rows = 9;
			});
		reasonSetting.settingEl.addClass('questline-reason-setting');

		new Setting(contentEl)
			.setName('Timespan')
			.setDesc('Required. A due date is measured from today.')
			.addText((text) => {
				inputs.timespan = text;
				text.setPlaceholder('6 Months');
				new ValueSuggest(this.app, text.inputEl, TIMESPAN_SUGGESTIONS);
			});

		new Setting(contentEl)
			.setName('Folder')
			.setDesc('Where the goal note is created.')
			.addText((text) => {
				inputs.folder = text;
				text.setPlaceholder('Goals').setValue(this.config.goalFolder);
				attachFolderSuggest(this.app, text.inputEl);
			})
			.addButton((button) =>
				button.setButtonText('Browse').onClick(() => {
					new FolderPickModal(this.app, (path) => {
						inputs.folder?.setValue(path);
					}).open();
				}),
			);

		new Setting(contentEl)
			.setName('Progress block')
			.setDesc('Add a live goal-progress block to the new note.')
			.addToggle((toggle) =>
				toggle.setValue(true).onChange((value) => {
					includeProgress = value;
				}),
			);

		if (timekeepAvailable) {
			new Setting(contentEl)
				.setName('Timekeep block')
				.setDesc('Add an empty timekeep block to the new note.')
				.addToggle((toggle) =>
					toggle.setValue(false).onChange((value) => {
						includeTimekeep = value;
					}),
				);
		}

		new Setting(contentEl)
			.setName('Project template')
			.setDesc(
				'Create a custom template for this goal, pick an existing ' +
					'template note, or use the global template.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('custom', 'Create a custom template')
					.addOption('existing', 'Use an existing template')
					.addOption('global', 'Use the global template')
					.setValue('custom')
					.onChange((value) => {
						templateMode =
							value === 'existing'
								? 'existing'
								: value === 'global'
									? 'global'
									: 'custom';
						existingTemplateRow?.settingEl.toggle(
							templateMode === 'existing',
						);
					}),
			);

		existingTemplateRow = new Setting(contentEl)
			.setName('Template note')
			.setDesc(
				'Pick a template note already in your vault. Create one ' +
					'first with Create starter templates if you have none.',
			)
			.addText((text) => {
				inputs.templatePath = text;
				text.setPlaceholder('Project template');
				attachTemplateSuggest(this.app, text.inputEl);
			})
			.addButton((button) =>
				button.setButtonText('Browse').onClick(() => {
					pickTemplate(this.app, (path) => {
						inputs.templatePath?.setValue(path);
					});
				}),
			);
		existingTemplateRow.settingEl.toggle(false);

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText('Create goal')
					.setCta()
					.onClick(() =>
						this.submit(
							inputs,
							templateMode,
							includeProgress,
							includeTimekeep,
						),
					),
			);

		inputs.title?.inputEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(
		inputs: GoalInputs,
		mode: GoalTemplateMode,
		includeProgress: boolean,
		includeTimekeep: boolean,
	): void {
		const draft: GoalDraft = {
			title: inputs.title?.getValue() ?? '',
			category: inputs.category?.getValue() ?? '',
			reason: inputs.reason?.getValue() ?? '',
			timespan: inputs.timespan?.getValue() ?? '',
			folder: inputs.folder?.getValue() ?? '',
			template: mode,
			templatePath: '',
			includeProgress,
			includeTimekeep,
		};

		const problem = validateGoal(draft);
		if (problem) {
			new Notice(problem.message);
			this.focus(problem.field, inputs);

			return;
		}

		if (mode === 'existing') {
			const templatePath = this.checkExistingTemplate(inputs);
			if (!templatePath) return;

			draft.templatePath = templatePath;
		}

		this.close();
		this.onCreate(draft);
	}

	private focus(field: GoalField, inputs: GoalInputs): void {
		const input =
			field === 'title'
				? inputs.title
				: field === 'category'
					? inputs.category
					: field === 'reason'
						? inputs.reason
						: inputs.timespan;

		input?.inputEl.focus();
	}

	/** Validate the picked template and return its canonical vault path. */
	private checkExistingTemplate(inputs: GoalInputs): string {
		const raw = inputs.templatePath?.getValue().trim() ?? '';
		if (!raw) {
			new Notice('Choose an existing template note, or create one first.');
			inputs.templatePath?.inputEl.focus();

			return '';
		}

		const file = findTemplateFile(this.app, raw);
		if (!file) {
			new Notice(
				'No template note found there. Create one in your vault first.',
			);
			inputs.templatePath?.inputEl.focus();

			return '';
		}

		if (!isTemplateNote(this.app, file)) {
			new Notice(
				'That note is not a template. Create a template note first.',
			);
			inputs.templatePath?.inputEl.focus();

			return '';
		}

		return file.path;
	}
}
