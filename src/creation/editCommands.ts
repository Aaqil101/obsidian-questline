/** Edit commands and the read-write half of editing existing notes. */
import { Notice, TFile } from 'obsidian';
import { goalTitle } from '../index/names';
import type { GoalNode, ProjectNode } from '../index/types';
import type QuestlinePlugin from '../main';
import { mergeAuthors, parseAuthors } from './authors';
import { ensureAuthorNotes } from './authorNotes';
import { confirmRenameCollision } from './confirmModal';
import {
	applyGoalEdit,
	applyProjectEdit,
	planRename,
	projectGoalNodes,
	unresolvedGoalCount,
	type GoalEditDraft,
	type ProjectEditDraft,
} from './edit';
import { EditGoalModal } from './editGoalModal';
import { EditProjectModal } from './editProjectModal';
import { editFrontmatter } from './frontmatter';
import { vaultPathExists } from './notes';

function activeGoal(plugin: QuestlinePlugin): GoalNode | null {
	const path = plugin.app.workspace.getActiveFile()?.path;
	if (!path) return null;

	return plugin.getIndex().goalByPath.get(path) ?? null;
}

function activeProject(plugin: QuestlinePlugin): ProjectNode | null {
	const path = plugin.app.workspace.getActiveFile()?.path;
	if (!path) return null;

	return plugin.getIndex().projectByPath.get(path) ?? null;
}

export function registerEditCommands(plugin: QuestlinePlugin): void {
	plugin.addCommand({
		id: 'edit-goal',
		name: 'Edit goal',
		checkCallback: (checking) => {
			const goal = activeGoal(plugin);
			if (!goal) return false;

			if (!checking) openGoalEditor(plugin, goal);

			return true;
		},
	});
	plugin.addCommand({
		id: 'edit-project',
		name: 'Edit project',
		checkCallback: (checking) => {
			const project = activeProject(plugin);
			if (!project) return false;

			if (!checking) openProjectEditor(plugin, project);

			return true;
		},
	});
}

/** Add any newly typed author names to the known-author list. */
export function rememberProjectAuthors(
	plugin: QuestlinePlugin,
	value: string,
): void {
	const names = parseAuthors(value);
	if (names.length === 0) return;

	const authors = mergeAuthors(plugin.settings.authors, names);
	if (authors.length === plugin.settings.authors.length) return;

	void plugin.updateSettings({ authors });
}

export function openGoalEditor(plugin: QuestlinePlugin, goal: GoalNode): void {
	new EditGoalModal(plugin.app, plugin.getConfig(), goal, (draft) => {
		void saveGoalEdit(plugin, goal, draft);
	}).open();
}

export function openProjectEditor(
	plugin: QuestlinePlugin,
	project: ProjectNode,
): void {
	const index = plugin.getIndex();
	const selected = projectGoalNodes(project, index.goalByPath);
	const unresolved = unresolvedGoalCount(project, index.goals);

	new EditProjectModal(
		plugin.app,
		plugin.getConfig(),
		index.goals,
		project,
		selected,
		unresolved,
		(draft) => {
			void saveProjectEdit(plugin, project, draft);
		},
	).open();
}

async function saveGoalEdit(
	plugin: QuestlinePlugin,
	goal: GoalNode,
	draft: GoalEditDraft,
): Promise<void> {
	const { app } = plugin;
	const file = app.vault.getAbstractFileByPath(goal.path);
	if (!(file instanceof TFile)) {
		new Notice('This goal is no longer in the vault.');

		return;
	}

	try {
		const originalTitle = goalTitle(goal.name, goal.aliases).trim();
		const rename = planRename(
			goal.path,
			originalTitle,
			draft.title,
			(path) => vaultPathExists(app, path),
		);

		if (
			rename &&
			rename.path !== rename.requestedPath &&
			vaultPathExists(app, rename.requestedPath)
		) {
			const confirmed = await confirmRenameCollision(
				app,
				rename.requestedPath,
				rename.path,
			);
			if (!confirmed) return;
		}

		await editFrontmatter(app, file, (frontmatter) => {
			applyGoalEdit(frontmatter, draft);
		});

		if (rename) {
			try {
				await app.fileManager.renameFile(file, rename.path);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				new Notice(
					`Updated the goal, but could not rename it: ${message}`,
				);

				return;
			}
		}

		new Notice(`Updated the goal ${draft.title.trim()}.`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Questline could not update the goal: ${message}`);
	}
}

async function saveProjectEdit(
	plugin: QuestlinePlugin,
	project: ProjectNode,
	draft: ProjectEditDraft,
): Promise<void> {
	const { app } = plugin;
	const file = app.vault.getAbstractFileByPath(project.path);
	if (!(file instanceof TFile)) {
		new Notice('This project is no longer in the vault.');

		return;
	}

	try {
		const originalTitle = goalTitle(
			project.name,
			project.fields.aliases,
		).trim();
		const rename = planRename(
			project.path,
			originalTitle,
			draft.title,
			(path) => vaultPathExists(app, path),
		);

		if (
			rename &&
			rename.path !== rename.requestedPath &&
			vaultPathExists(app, rename.requestedPath)
		) {
			const confirmed = await confirmRenameCollision(
				app,
				rename.requestedPath,
				rename.path,
			);
			if (!confirmed) return;
		}

		await editFrontmatter(app, file, (frontmatter) => {
			applyProjectEdit(
				frontmatter,
				draft,
				plugin.getConfig().authorWikilink,
			);
		});
		rememberProjectAuthors(plugin, draft.author);
		if (plugin.getConfig().authorWikilink) {
			await ensureAuthorNotes(
				app,
				plugin.getConfig(),
				draft.author,
				project.path,
			);
		}

		if (rename) {
			try {
				await app.fileManager.renameFile(file, rename.path);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				new Notice(
					`Updated the project, but could not rename it: ${message}`,
				);

				return;
			}
		}

		new Notice(`Updated the project ${draft.title.trim()}.`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Questline could not update the project: ${message}`);
	}
}
