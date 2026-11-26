/** The New project modal and its goal picker. Nothing is written on cancel. */
import {
	FuzzySuggestModal,
	Modal,
	Notice,
	Setting,
	type App,
	type TextComponent,
} from 'obsidian';
import { withoutDate } from '../index/names';
import type { GoalNode } from '../index/types';
import {
	attachFolderSuggest,
	attachNoteSuggest,
	FolderPickModal,
	NotePickModal,
} from '../settings/folderPicker';
import type { QuestlineConfig } from '../settings/types';
import { isTimekeepInstalled } from '../timekeep/timekeep';
import type { ProjectDraft, ProjectGoalLink } from './plan';
import {
	announceMissingTemplate,
	defaultProjectTemplatePath,
	goalTemplatePath,
} from './templates';

interface ProjectInputs {
	title?: TextComponent;
	author?: TextComponent;
	subtitle?: TextComponent;
	template?: TextComponent;
	folder?: TextComponent;
}

/** A goal is listed by its alias and title, so either one finds it. */
function goalLabel(goal: GoalNode): string {
	const alias = goal.aliases[0]?.trim();
	const title = withoutDate(goal.name);

	if (alias && alias.toLowerCase() !== title.toLowerCase()) {
		return `${alias} (${title})`;
	}

	return alias || title;
}

class GoalPickModal extends FuzzySuggestModal<GoalNode> {
	constructor(
		app: App,
		private readonly goals: readonly GoalNode[],
		private readonly onPick: (goal: GoalNode) => void,
	) {
		super(app);
		this.emptyStateText = 'No goal matches that.';
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.setPlaceholder('Add a goal.');
	}

	getItems(): GoalNode[] {
		return [...this.goals];
	}

	getItemText(item: GoalNode): string {
		return goalLabel(item);
	}

	onChooseItem(item: GoalNode): void {
		this.onPick(item);
	}
}

export class ProjectModal extends Modal {
	constructor(
		app: App,
		private readonly config: QuestlineConfig,
		private readonly goals: readonly GoalNode[],
		private readonly onCreate: (draft: ProjectDraft) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		const app = this.app;
		const goals = this.goals;
		contentEl.empty();
		this.setTitle('New project');
		this.modalEl.addClass('questline-modal');

		const inputs: ProjectInputs = {};
		let selectedGoals: GoalNode[] = [];
		let selectedEl: HTMLElement | null = null;
		let status = this.config.projectStatuses[0] ?? 'Todo';
		let templateDefault = defaultProjectTemplatePath(
			this.app,
			this.config,
			null,
		);
		let includeProgress = true;
		const timekeepAvailable = isTimekeepInstalled(this.app);
		let includeTimekeep = timekeepAvailable;

		const goalTemplateTarget = (): string | null => {
			for (const goal of selectedGoals) {
				if (goal.fields.projectTemplate) {
					return goal.fields.projectTemplate;
				}
			}

			return null;
		};

		const updateTemplateDefault = (): void => {
			const current = inputs.template?.getValue() ?? '';
			if (current !== templateDefault) return;

			templateDefault = defaultProjectTemplatePath(
				this.app,
				this.config,
				goalTemplateTarget(),
			);
			inputs.template?.setValue(templateDefault);
		};

		function renderSelectedGoals(): void {
			if (!selectedEl) return;

			selectedEl.empty();
			if (selectedGoals.length === 0) {
				selectedEl.createDiv({
					cls: 'questline-goal-empty',
					text: 'No goals selected.',
				});

				return;
			}

			for (const goal of selectedGoals) {
				const row = selectedEl.createDiv({
					cls: 'questline-goal-chip',
				});
				row.createSpan({
					cls: 'questline-goal-chip-label',
					text: goalLabel(goal),
				});
				const remove = row.createEl('button', {
					cls: 'questline-goal-chip-remove',
					text: '×',
					attr: {
						type: 'button',
						'aria-label': `Remove ${goalLabel(goal)}`,
					},
				});
				remove.addEventListener('click', (event) => {
					event.preventDefault();
					event.stopPropagation();
					selectedGoals = selectedGoals.filter(
						(item) => item.path !== goal.path,
					);
					renderSelectedGoals();
					updateTemplateDefault();
				});
			}
		}

		function pickGoal(): void {
			const available = goals.filter(
				(goal) =>
					!selectedGoals.some((item) => item.path === goal.path),
			);

			new GoalPickModal(app, available, (goal) => {
				selectedGoals = [...selectedGoals, goal];
				renderSelectedGoals();
				updateTemplateDefault();
			}).open();
		}

		const titleSetting = new Setting(contentEl)
			.setName('Title')
			.setDesc('The project name, used for the note and its filename.')
			.addText((text) => {
				inputs.title = text;
				text.setPlaceholder('What are you working on?');
			});
		titleSetting.settingEl.addClass('questline-title-setting');

		new Setting(contentEl)
			.setName('Goals')
			.setDesc('Optional. Add every goal this project serves.')
			.addButton((button) => {
				button
					.setButtonText('Add goal')
					.setDisabled(goals.length === 0)
					.onClick(pickGoal);
			});
		selectedEl = contentEl.createDiv({
			cls: 'questline-goal-picker',
		});
		renderSelectedGoals();

		new Setting(contentEl)
			.setName('Status')
			.setDesc('Statuses come from the project statuses setting.')
			.addDropdown((dropdown) => {
				for (const option of this.config.projectStatuses) {
					dropdown.addOption(option, option);
				}

				dropdown.setValue(status).onChange((value) => {
					status = value;
				});
			});

		new Setting(contentEl)
			.setName('Author')
			.setDesc('Optional. Defaults to the configured author.')
			.addText((text) => {
				inputs.author = text;
				text.setValue(this.config.defaultAuthor);
			});

		new Setting(contentEl)
			.setName('Subtitle')
			.setDesc('Optional. A short line under the title.')
			.addText((text) => {
				inputs.subtitle = text;
				text.setPlaceholder('A short summary');
			});

		new Setting(contentEl)
			.setName('Template')
			.setDesc(
				'Defaults to the goal template, then the global template, then ' +
					'the built-in body. Pick any note to override it.',
			)
			.addText((text) => {
				inputs.template = text;
				text.setPlaceholder('Built-in project template');
				text.setValue(templateDefault);
				attachNoteSuggest(this.app, text.inputEl);
			})
			.addButton((button) =>
				button.setButtonText('Browse').onClick(() => {
					new NotePickModal(this.app, (path) => {
						inputs.template?.setValue(path);
					}).open();
				}),
			);

		new Setting(contentEl)
			.setName('Folder')
			.setDesc('Where the project note is created.')
			.addText((text) => {
				inputs.folder = text;
				text.setPlaceholder('Projects').setValue(this.config.projectFolder);
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
			.setDesc('Add a live project-progress block to the new note.')
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
					toggle.setValue(includeTimekeep).onChange((value) => {
						includeTimekeep = value;
					}),
				);
		}

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText('Create project')
					.setCta()
					.onClick(() =>
						this.submit(
							inputs,
							selectedGoals,
							status,
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
		inputs: ProjectInputs,
		goals: readonly GoalNode[],
		status: string,
		includeProgress: boolean,
		includeTimekeep: boolean,
	): void {
		const title = inputs.title?.getValue() ?? '';
		if (!title.trim()) {
			new Notice('Give the project a title first.');
			inputs.title?.inputEl.focus();

			return;
		}

		const seenTemplates = new Set<string>();
		for (const goal of goals) {
			const target = goal.fields.projectTemplate;
			if (
				target &&
				!seenTemplates.has(target) &&
				goalTemplatePath(this.app, target).missing
			) {
				seenTemplates.add(target);
				announceMissingTemplate(target);
			}
		}

		const links: ProjectGoalLink[] = goals.map((goal) => ({
			path: goal.path,
			name: goal.name,
			display: goal.aliases[0],
		}));

		this.close();
		this.onCreate({
			title,
			goals: links,
			status,
			author: inputs.author?.getValue() ?? '',
			subtitle: inputs.subtitle?.getValue() ?? '',
			template: inputs.template?.getValue() ?? '',
			folder: inputs.folder?.getValue() ?? '',
			includeProgress,
			includeTimekeep,
		});
	}
}
