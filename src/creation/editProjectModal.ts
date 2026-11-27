/** Edit an existing project's frontmatter, links, and title. */
import {
	Modal,
	Notice,
	Setting,
	type App,
	type TextAreaComponent,
	type TextComponent,
} from 'obsidian';
import type { GoalNode, ProjectNode } from '../index/types';
import type { QuestlineConfig } from '../settings/types';
import {
	projectEditDraft,
	projectGoalLink,
	type ProjectEditDraft,
} from './edit';
import { GoalPicker } from './goalPicker';
import { ValueSuggest } from './suggest';
import { validateProjectEdit } from './validate';

interface ProjectInputs {
	title?: TextComponent;
	author?: TextComponent;
	subtitle?: TextAreaComponent;
}

export class EditProjectModal extends Modal {
	constructor(
		app: App,
		private readonly config: QuestlineConfig,
		private readonly goals: readonly GoalNode[],
		private readonly project: ProjectNode,
		private readonly selectedGoals: readonly GoalNode[],
		private readonly unresolved: number,
		private readonly onSave: (draft: ProjectEditDraft) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		const draft = projectEditDraft(this.project, this.selectedGoals);
		const inputs: ProjectInputs = {};
		let selectedGoals = [...this.selectedGoals];
		let picker: GoalPicker | null = null;
		const currentStatus = this.project.fields.status?.trim();
		const configuredStatus = currentStatus
			? this.config.projectStatuses.find(
					(option) =>
						option.toLowerCase() === currentStatus.toLowerCase(),
				)
			: undefined;
		let status =
			configuredStatus ??
			currentStatus ??
			this.config.projectStatuses[0] ??
			'Todo';

		contentEl.empty();
		this.setTitle('Edit project');
		this.modalEl.addClass('questline-modal');

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
			.setName('Goals')
			.setDesc('Optional. Add every goal this project serves.')
			.addButton((button) => {
				button
					.setButtonText('Add goal')
					.setDisabled(this.goals.length === 0)
					.onClick(() => picker?.pick());
			});
		const selectedEl = contentEl.createDiv({
			cls: 'questline-goal-picker',
		});
		picker = new GoalPicker(selectedEl, {
			app: this.app,
			goals: this.goals,
			selected: selectedGoals,
			onChange: (next) => {
				selectedGoals = next;
			},
		});

		if (this.unresolved > 0) {
			contentEl.createEl('p', {
				cls: 'questline-edit-warning',
				text:
					`${this.unresolved} existing goal ` +
					`${this.unresolved === 1 ? 'link does' : 'links do'} not resolve. ` +
					'Saving drops the unresolved links.',
			});
		}

		new Setting(contentEl)
			.setName('Status')
			.setDesc('Statuses come from the project statuses setting.')
			.addDropdown((dropdown) => {
				const options = [...this.config.projectStatuses];
				if (currentStatus && !configuredStatus) {
					options.push(currentStatus);
				}
				if (options.length === 0) options.push(status);

				for (const option of options) {
					dropdown.addOption(option, option);
				}

				dropdown.setValue(status).onChange((value) => {
					status = value;
				});
			});

		const authorSuggestions = [
			...new Set(
				[...this.config.authors, this.config.defaultAuthor].filter(
					(name) => name.trim() !== '',
				),
			),
		];

		new Setting(contentEl)
			.setName('Author')
			.setDesc('Optional. Separate several authors with commas.')
			.addText((text) => {
				inputs.author = text;
				text.setValue(draft.author);
				new ValueSuggest(this.app, text.inputEl, authorSuggestions);
			});

		if (this.config.authorWikilink) {
			contentEl.createEl('p', {
				cls: 'setting-item-description',
				text: 'Authors are saved as wikilinks, such as [[author]].',
			});
		}

		const subtitleSetting = new Setting(contentEl)
			.setName('Subtitle')
			.setDesc('Optional. A short line under the title.')
			.addTextArea((text) => {
				inputs.subtitle = text;
				text.setValue(draft.subtitle);
				text.inputEl.rows = 9;
			});
		subtitleSetting.settingEl.addClass('questline-reason-setting');

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText('Save changes')
					.setCta()
					.onClick(() =>
						this.submit(
							inputs,
							selectedGoals,
							status,
							picker,
						),
					),
			);

		inputs.title?.inputEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(
		inputs: ProjectInputs,
		fallbackGoals: readonly GoalNode[],
		status: string,
		picker: GoalPicker | null,
	): void {
		const goals = picker?.getSelected() ?? fallbackGoals;
		const draft: ProjectEditDraft = {
			title: inputs.title?.getValue() ?? '',
			goals: goals.map(projectGoalLink),
			status,
			author: inputs.author?.getValue() ?? '',
			subtitle: inputs.subtitle?.getValue() ?? '',
		};

		const problem = validateProjectEdit(draft);
		if (problem) {
			new Notice(problem.message);
			if (problem.field === 'title') inputs.title?.inputEl.focus();

			return;
		}

		this.close();
		this.onSave(draft);
	}
}
