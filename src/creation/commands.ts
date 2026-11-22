/** Commands that create goals and projects from the current settings. */
import { Notice } from 'obsidian';
import type QuestlinePlugin from '../main';
import { readTemplate } from '../templates/notes';
import { GoalModal } from './goalModal';
import { openCreatedNote, vaultPathExists, writeCreation } from './notes';
import {
	planGoal,
	planProject,
	type GoalDraft,
	type ProjectDraft,
} from './plan';
import { ProjectModal } from './projectModal';
import {
	announceMissingTemplate,
	readChosenProjectTemplate,
} from './templates';

export function registerCreationCommands(plugin: QuestlinePlugin): void {
	plugin.addCommand({
		id: 'new-goal',
		name: 'New goal',
		callback: () => openGoalModal(plugin),
	});
	plugin.addCommand({
		id: 'new-project',
		name: 'New project',
		callback: () => openProjectModal(plugin),
	});
}

function openGoalModal(plugin: QuestlinePlugin): void {
	new GoalModal(plugin.app, plugin.getConfig(), (draft) => {
		void createGoal(plugin, draft);
	}).open();
}

function openProjectModal(plugin: QuestlinePlugin): void {
	new ProjectModal(
		plugin.app,
		plugin.getConfig(),
		plugin.getIndex().goals,
		(draft) => {
			void createProject(plugin, draft);
		},
	).open();
}

async function createGoal(
	plugin: QuestlinePlugin,
	draft: GoalDraft,
): Promise<void> {
	const { app } = plugin;
	const config = plugin.getConfig();

	try {
		const [goalTemplate, projectTemplate] = await Promise.all([
			config.goalTemplate
				? readTemplate(app, config.goalTemplate)
				: Promise.resolve(null),
			config.projectTemplate
				? readTemplate(app, config.projectTemplate)
				: Promise.resolve(null),
		]);

		const plan = planGoal(
			draft,
			{
				config,
				now: new Date(),
				exists: (path) => vaultPathExists(app, path),
			},
			{ goal: goalTemplate, project: projectTemplate },
		);

		const file = await writeCreation(app, plan);
		new Notice(`Created the goal ${file.basename}.`);

		if (config.openAfterCreate) await openCreatedNote(app, file);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Questline could not create the goal: ${message}`);
	}
}

async function createProject(
	plugin: QuestlinePlugin,
	draft: ProjectDraft,
): Promise<void> {
	const { app } = plugin;
	const config = plugin.getConfig();

	try {
		const resolved = await readChosenProjectTemplate(
			app,
			config,
			draft.template,
		);
		if (resolved.missing) {
			announceMissingTemplate(draft.template.trim());
		}

		const plan = planProject(
			draft,
			{
				config,
				now: new Date(),
				exists: (path) => vaultPathExists(app, path),
			},
			{ template: resolved.document },
		);

		const file = await writeCreation(app, plan);
		new Notice(`Created the project ${file.basename}.`);

		if (config.openAfterCreate) await openCreatedNote(app, file);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Questline could not create the project: ${message}`);
	}
}
