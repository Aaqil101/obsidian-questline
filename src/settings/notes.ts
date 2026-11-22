import { Setting, TFolder, type SettingDefinitionGroup } from 'obsidian';
import type QuestlinePlugin from '../main';
import { folderSetting } from './folderPicker';
import { renderListEditor } from './listEditor';
import { normalizeFolder } from './types';
import {
	group,
	noteParagraph,
	pageDefinition,
	type SettingsHost,
} from './ui';

/**
 * Normalize a folder and refuse a path that already holds a note. An empty
 * result is the vault root, which the settings page explains.
 */
function folderNormalizer(
	plugin: QuestlinePlugin,
): (raw: string) => string {
	return (raw) => {
		const path = normalizeFolder(raw);
		if (!path) return '';

		const entry = plugin.app.vault.getAbstractFileByPath(path);

		return entry && !(entry instanceof TFolder) ? '' : path;
	};
}

/** Landing group: where notes live, and the two field sub-pages. */
export function notesGroup(host: SettingsHost): SettingDefinitionGroup {
	return {
		type: 'group',
		heading: 'Notes',
		items: [
			pageDefinition(
				host,
				'Folders',
				'Where new goals, projects, and templates are stored.',
				renderFoldersPage,
			),
			pageDefinition(
				host,
				'Tags and lists',
				'Goal and project tags, plus the category and status choices.',
				renderFieldsPage,
			),
		],
	};
}

/** Folders sub-page: the three creation destinations and template storage. */
function renderFoldersPage(
	host: SettingsHost,
	containerEl: HTMLElement,
): void {
	const { plugin } = host;
	const { settings } = plugin;
	const card = group(containerEl, 'Folders');
	const normalize = folderNormalizer(plugin);

	noteParagraph(
		card,
		'Folders stay vault-relative. A folder that does not exist yet is created when the first note is written to it. A blank folder, or a path already used by a note, means the vault root.',
	);

	const goal = new Setting(card)
		.setName('Goal folder')
		.setDesc('Where new goals are created.');
	folderSetting(goal, {
		app: plugin.app,
		value: settings.goalFolder,
		placeholder: 'goals',
		normalize,
		commit: (path) => plugin.updateSettings({ goalFolder: path }),
	});

	const project = new Setting(card)
		.setName('Project folder')
		.setDesc('Where new projects are created.');
	folderSetting(project, {
		app: plugin.app,
		value: settings.projectFolder,
		placeholder: 'projects',
		normalize,
		commit: (path) => plugin.updateSettings({ projectFolder: path }),
	});

	const template = new Setting(card)
		.setName('Template folder')
		.setDesc('Where starter and per-goal project templates are stored.');
	folderSetting(template, {
		app: plugin.app,
		value: settings.templateFolder,
		placeholder: 'templates',
		normalize,
		commit: (path) => plugin.updateSettings({ templateFolder: path }),
	});
}

/** Tags and lists sub-page: the two tags plus the picker vocabularies. */
function renderFieldsPage(
	host: SettingsHost,
	containerEl: HTMLElement,
): void {
	const { plugin } = host;
	const { settings } = plugin;
	const tags = group(containerEl, 'Tags');

	noteParagraph(
		tags,
		'The leading # is optional and case does not matter. Changing a tag re-reads the index.',
	);

	new Setting(tags)
		.setName('Goal tag')
		.setDesc('Marks a note as a goal.')
		.addText((text) =>
			text
				.setPlaceholder('Goal')
				.setValue(settings.goalTag)
				.onChange((value) => {
					void plugin.updateSettings({ goalTag: value });
				}),
		);

	new Setting(tags)
		.setName('Project tag')
		.setDesc(
			'Marks a note as a project. A project also needs a status or a project class.',
		)
		.addText((text) =>
			text
				.setPlaceholder('Project')
				.setValue(settings.projectTag)
				.onChange((value) => {
					void plugin.updateSettings({ projectTag: value });
				}),
		);

	renderListEditor({
		containerEl,
		name: 'Goal categories',
		desc: 'Suggestions for the category picker when creating a goal.',
		values: settings.goalCategories,
		placeholder: 'New category',
		onChange: (values) => plugin.updateSettings({ goalCategories: values }),
	});

	renderListEditor({
		containerEl,
		name: 'Project statuses',
		desc: 'Suggestions for the status picker when creating a project.',
		values: settings.projectStatuses,
		placeholder: 'New status',
		onChange: (values) => plugin.updateSettings({ projectStatuses: values }),
	});
}
