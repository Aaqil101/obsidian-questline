/**
 * Manage the project template attached to one goal: create it, pick an
 * existing note, open it, or clear the link. Template notes carry the marker
 * that keeps them out of the index.
 */
import { Modal, Notice, Setting, TFile, type App } from 'obsidian';
import { TEMPLATE_TYPE } from '../constants';
import type { GoalNode } from '../index/types';
import type QuestlinePlugin from '../main';
import { NotePickModal } from '../settings/folderPicker';
import { BUILTIN_PROJECT } from '../templates/builtin';
import {
	ensureVaultFolder,
	findTemplateFile,
	noteText,
	readTemplate,
} from '../templates/notes';
import {
	editFrontmatter,
	removeFrontmatterKey,
	setFrontmatterKey,
} from './frontmatter';
import { openNote, vaultPathExists } from './notes';
import { planProjectTemplate, withoutExtension } from './plan';
import { announceMissingTemplate, goalTemplatePath } from './templates';

function activeGoal(plugin: QuestlinePlugin): GoalNode | null {
	const file = plugin.app.workspace.getActiveFile();
	if (!file) return null;

	return plugin.getIndex().goalByPath.get(file.path) ?? null;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function goalFile(app: App, goal: GoalNode): TFile {
	const file = app.vault.getAbstractFileByPath(goal.path);
	if (!(file instanceof TFile)) {
		throw new Error(`The goal note is missing: ${goal.path}`);
	}

	return file;
}

async function setGoalTemplate(
	app: App,
	goal: GoalNode,
	path: string,
): Promise<void> {
	await editFrontmatter(app, goalFile(app, goal), (frontmatter) => {
		setFrontmatterKey(
			frontmatter,
			'project_template',
			`[[${withoutExtension(path)}]]`,
		);
	});
}

async function createTemplateForGoal(
	plugin: QuestlinePlugin,
	goal: GoalNode,
): Promise<void> {
	const { app } = plugin;
	const config = plugin.getConfig();
	const seed = config.projectTemplate
		? await readTemplate(app, config.projectTemplate)
		: null;
	const plan = planProjectTemplate(
		goal.name,
		{
			config,
			now: new Date(),
			exists: (path) => vaultPathExists(app, path),
		},
		seed ?? BUILTIN_PROJECT,
	);

	const folder = plan.path.slice(0, plan.path.lastIndexOf('/'));
	if (folder) await ensureVaultFolder(app, folder);

	const file = await app.vault.create(plan.path, noteText(plan.parts));

	try {
		await setGoalTemplate(app, goal, file.path);
	} catch (error) {
		try {
			await app.fileManager.trashFile(file);
		} catch {
			// The link error is the one that matters.
		}

		throw error;
	}

	new Notice(`Created ${file.basename} and linked it to this goal.`);
}

async function setExistingTemplate(
	plugin: QuestlinePlugin,
	goal: GoalNode,
	path: string,
): Promise<void> {
	const { app } = plugin;
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile) || file.extension !== 'md') {
		new Notice('Choose a Markdown note to use as the template.');

		return;
	}

	if (file.path === goal.path) {
		new Notice('A goal cannot use itself as its project template.');

		return;
	}

	const index = plugin.getIndex();
	if (index.goalByPath.has(file.path) || index.projectByPath.has(file.path)) {
		new Notice('Choose a note that is not an indexed goal or project.');

		return;
	}

	await editFrontmatter(app, file, (frontmatter) => {
		setFrontmatterKey(frontmatter, 'type', TEMPLATE_TYPE);
	});
	await setGoalTemplate(app, goal, file.path);

	new Notice(`Set ${file.basename} as this goal's project template.`);
}

async function openGoalTemplate(
	plugin: QuestlinePlugin,
	goal: GoalNode,
): Promise<void> {
	const { app } = plugin;
	const target = goal.fields.projectTemplate;

	if (target) {
		const file = findTemplateFile(app, target);
		if (file) {
			await openNote(app, file);

			return;
		}

		announceMissingTemplate(target);
	}

	const global = findTemplateFile(app, plugin.getConfig().projectTemplate);
	if (global) {
		await openNote(app, global);

		return;
	}

	new Notice(
		'This goal has no project template, so new projects use the built-in body.',
	);
}

async function clearGoalTemplate(
	plugin: QuestlinePlugin,
	goal: GoalNode,
): Promise<void> {
	await editFrontmatter(plugin.app, goalFile(plugin.app, goal), (frontmatter) => {
		removeFrontmatterKey(frontmatter, 'project_template');
	});

	new Notice('Cleared the custom template. This goal uses the global one.');
}

class GoalTemplateModal extends Modal {
	constructor(
		app: App,
		private readonly plugin: QuestlinePlugin,
		private readonly goal: GoalNode,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle('Goal project template');
		contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: this.describe(),
		});

		this.action(
			'Create project template',
			'Write a new template in the template folder and link it to this goal.',
			'Create',
			() => createTemplateForGoal(this.plugin, this.goal),
			true,
		);

		this.action(
			'Set existing template',
			'Use a note you already have. It is marked as a template so it stays out of the index.',
			'Choose',
			() => this.chooseExisting(),
		);

		this.action(
			'Open template',
			'Open the goal template, or the global template that stands in for it.',
			'Open',
			() => openGoalTemplate(this.plugin, this.goal),
		);

		const hasCustom = Boolean(this.goal.fields.projectTemplate);
		this.action(
			'Clear custom template',
			'Remove the link and fall back to the global template.',
			'Clear',
			() => clearGoalTemplate(this.plugin, this.goal),
			false,
			!hasCustom,
		);

		new Setting(contentEl).addButton((button) =>
			button.setButtonText('Close').onClick(() => this.close()),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private describe(): string {
		const target = this.goal.fields.projectTemplate;
		const global = findTemplateFile(
			this.app,
			this.plugin.getConfig().projectTemplate,
		);
		const fallback = global?.path ?? 'the built-in template';

		if (target) {
			const resolution = goalTemplatePath(this.app, target);
			if (resolution.path) return `This goal uses ${resolution.path}.`;

			return `The linked template "${target}" is missing. New projects use ${fallback}.`;
		}

		return `This goal has no custom template. New projects use ${fallback}.`;
	}

	private chooseExisting(): void {
		this.close();
		new NotePickModal(this.app, (path) => {
			void setExistingTemplate(this.plugin, this.goal, path).catch(
				(error) => {
					new Notice(
						`Questline could not set the template: ${errorMessage(error)}`,
					);
				},
			);
		}).open();
	}

	private action(
		name: string,
		desc: string,
		buttonText: string,
		run: () => Promise<void> | void,
		cta = false,
		disabled = false,
	): void {
		const setting = new Setting(this.contentEl)
			.setName(name)
			.setDesc(desc);
		setting.addButton((button) => {
			button.setButtonText(buttonText).onClick(() => {
				this.close();
				void Promise.resolve(run()).catch((error) => {
					new Notice(
						`Questline could not update the template: ${errorMessage(error)}`,
					);
				});
			});

			if (cta) button.setCta();
			if (disabled) button.setDisabled(true);
		});
	}
}

export function registerGoalTemplateCommands(
	plugin: QuestlinePlugin,
): void {
	plugin.addCommand({
		id: 'manage-goal-project-template',
		name: 'Manage project template for this goal',
		checkCallback: (checking) => {
			const goal = activeGoal(plugin);
			if (!goal) return false;

			if (!checking) {
				new GoalTemplateModal(plugin.app, plugin, goal).open();
			}

			return true;
		},
	});
}
