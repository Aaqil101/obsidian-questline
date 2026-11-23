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
import type { GoalDraft, GoalTemplateMode } from './plan';
import { ValueSuggest } from './suggest';

const TIMESPAN_SUGGESTIONS = [
	'1 Month',
	'3 Months',
	'6 Months',
	'1 Year',
	'Infinite',
];

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

		const inputs: {
			title?: TextComponent;
			category?: TextComponent;
			reason?: TextAreaComponent;
			timespan?: TextComponent;
			folder?: TextComponent;
		} = {};
		let templateMode: GoalTemplateMode = 'custom';

		new Setting(contentEl)
			.setName('Title')
			.setDesc('The goal name, used for the note and its filename.')
			.addText((text) => {
				inputs.title = text;
				text.setPlaceholder('What do you want to achieve?');
			});

		new Setting(contentEl)
			.setName('Category')
			.setDesc('Optional. Suggestions come from the goal categories.')
			.addText((text) => {
				inputs.category = text;
				text.setPlaceholder('Learning');
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
				text.setPlaceholder('What this goal changes');
				text.inputEl.rows = 4;
			});

		new Setting(contentEl)
			.setName('Timespan')
			.setDesc('Optional. A due date is measured from today.')
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
			.setName('Project template')
			.setDesc(
				'A custom template is created for this goal and linked through ' +
					'project_template. Pick global to use the configured template instead.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('custom', 'Custom template for this goal')
					.addOption('global', 'Global project template')
					.setValue('custom')
					.onChange((value) => {
						templateMode = value === 'global' ? 'global' : 'custom';
					}),
			);

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
							{
								title: inputs.title?.getValue() ?? '',
								category: inputs.category?.getValue() ?? '',
								reason: inputs.reason?.getValue() ?? '',
								timespan: inputs.timespan?.getValue() ?? '',
								folder: inputs.folder?.getValue() ?? '',
								template: templateMode,
							},
							inputs.title,
						),
					),
			);

		inputs.title?.inputEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(
		draft: GoalDraft,
		titleInput: TextComponent | undefined,
	): void {
		if (!draft.title.trim()) {
			new Notice('Give the goal a title first.');
			titleInput?.inputEl.focus();

			return;
		}

		this.close();
		this.onCreate(draft);
	}
}
