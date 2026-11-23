/** The New project modal and its goal picker. Nothing is written on cancel. */
import {
	FuzzySuggestModal,
	Modal,
	Notice,
	Setting,
	type App,
	type ButtonComponent,
	type TextComponent,
} from 'obsidian';
import type { GoalNode } from '../index/types';
import {
	attachFolderSuggest,
	attachNoteSuggest,
	FolderPickModal,
	NotePickModal,
} from '../settings/folderPicker';
import type { QuestlineConfig } from '../settings/types';
import type { ProjectDraft, ProjectGoalLink } from './plan';
import {
	announceMissingTemplate,
	defaultProjectTemplatePath,
	goalTemplatePath,
} from './templates';

interface GoalChoice {
	goal: GoalNode | null;
}

const NO_GOAL: GoalChoice = { goal: null };

interface ProjectInputs {
	title?: TextComponent;
	author?: TextComponent;
	subtitle?: TextComponent;
	template?: TextComponent;
	folder?: TextComponent;
}

/** A goal is listed by its alias and name, so either one finds it. */
function goalLabel(goal: GoalNode): string {
	const alias = goal.aliases[0]?.trim();
	if (alias && alias.toLowerCase() !== goal.name.toLowerCase()) {
		return `${alias} (${goal.name})`;
	}

	return goal.name;
}

class GoalPickModal extends FuzzySuggestModal<GoalChoice> {
	constructor(
		app: App,
		private readonly goals: readonly GoalNode[],
		private readonly onPick: (goal: GoalNode | null) => void,
	) {
		super(app);
		this.emptyStateText = 'No goal matches that.';
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.setPlaceholder('Jump to a goal.');
	}

	getItems(): GoalChoice[] {
		return [NO_GOAL, ...this.goals.map((goal) => ({ goal }))];
	}

	getItemText(item: GoalChoice): string {
		return item.goal ? goalLabel(item.goal) : 'No goal';
	}

	onChooseItem(item: GoalChoice): void {
		this.onPick(item.goal);
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
		contentEl.empty();
		this.setTitle('New project');
		this.modalEl.addClass('questline-modal');

		const inputs: ProjectInputs = {};
		let selectedGoal: GoalNode | null = null;
		let status = this.config.projectStatuses[0] ?? 'Todo';
		let templateDefault = defaultProjectTemplatePath(
			this.app,
			this.config,
			null,
		);
		let goalButton: ButtonComponent | null = null;

		const updateTemplateDefault = (): void => {
			const current = inputs.template?.getValue() ?? '';
			if (current !== templateDefault) return;

			templateDefault = defaultProjectTemplatePath(
				this.app,
				this.config,
				selectedGoal?.fields.projectTemplate ?? null,
			);
			inputs.template?.setValue(templateDefault);
		};

		const pickGoal = (): void => {
			new GoalPickModal(this.app, this.goals, (goal) => {
				selectedGoal = goal;
				goalButton?.setButtonText(goal ? goalLabel(goal) : 'No goal');
				updateTemplateDefault();
			}).open();
		};

		new Setting(contentEl)
			.setName('Title')
			.setDesc('The project name, used for the note and its filename.')
			.addText((text) => {
				inputs.title = text;
				text.setPlaceholder('What are you working on?');
			});

		new Setting(contentEl)
			.setName('Goal')
			.setDesc('Optional. A project without a goal stands alone.')
			.addButton((button) => {
				goalButton = button;
				button.setButtonText('No goal').onClick(pickGoal);
			});

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
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText('Create project')
					.setCta()
					.onClick(() => this.submit(inputs, selectedGoal, status)),
			);

		inputs.title?.inputEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(
		inputs: ProjectInputs,
		goal: GoalNode | null,
		status: string,
	): void {
		const title = inputs.title?.getValue() ?? '';
		if (!title.trim()) {
			new Notice('Give the project a title first.');
			inputs.title?.inputEl.focus();

			return;
		}

		const goalTarget = goal?.fields.projectTemplate ?? null;
		if (goalTarget && goalTemplatePath(this.app, goalTarget).missing) {
			announceMissingTemplate(goalTarget);
		}

		const link: ProjectGoalLink | null = goal
			? {
					path: goal.path,
					name: goal.name,
					display: goal.aliases[0] ?? goal.name,
				}
			: null;

		this.close();
		this.onCreate({
			title,
			goal: link,
			status,
			author: inputs.author?.getValue() ?? '',
			subtitle: inputs.subtitle?.getValue() ?? '',
			template: inputs.template?.getValue() ?? '',
			folder: inputs.folder?.getValue() ?? '',
		});
	}
}
