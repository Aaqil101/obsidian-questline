import { Setting, TFolder, type SettingDefinitionGroup } from 'obsidian';
import type QuestlinePlugin from '../main';
import {
	announceStarterError,
	announceStarterResult,
} from '../templates/notes';
import { folderSetting, noteSetting } from './folderPicker';
import { renderListEditor } from './listEditor';
import {
	DEFAULT_GOAL_CATEGORIES,
	DEFAULT_PROJECT_STATUSES,
	normalizeFolder,
	normalizeTemplate,
} from './types';
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

/** Landing group: where notes live, the template files, and the two field sub-pages. */
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
				'Templates',
				'Global goal, project, and author templates, and the starter templates.',
				renderTemplatesPage,
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

/** Folders sub-page: where new goals and projects are created. */
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

	const author = new Setting(card)
		.setName('Author folder')
		.setDesc('Where missing author notes are created.');
	folderSetting(author, {
		app: plugin.app,
		value: settings.authorFolder,
		placeholder: 'authors',
		normalize,
		commit: (path) => plugin.updateSettings({ authorFolder: path }),
	});

	const journal = new Setting(card)
		.setName('Journal folder')
		.setDesc(
			'Daily notes that dates link into. A date links only when its note exists here, or when it is today or later. Leave blank to keep dates plain.',
		);
	folderSetting(journal, {
		app: plugin.app,
		value: settings.journalFolder,
		placeholder: 'Choose a folder',
		normalize,
		commit: (path) => plugin.updateSettings({ journalFolder: path }),
	});
}

/**
 * Templates sub-page: the two global template notes, then the folder the
 * starter files are written to and the button that writes them. A path that
 * points at a folder cannot be a template, so it clears instead.
 */
function renderTemplatesPage(
	host: SettingsHost,
	containerEl: HTMLElement,
): void {
	const { plugin } = host;
	const { settings } = plugin;
	const card = group(containerEl, 'Global templates');
	const normalize = (raw: string): string => {
		const path = normalizeTemplate(raw);
		if (!path) return '';

		return plugin.app.vault.getAbstractFileByPath(path) instanceof TFolder
			? ''
			: path;
	};

	noteParagraph(
		card,
		'Creation uses the goal\'s own project template first, then the global template here, then the built-in body. Leave a template blank to use the built-in one.',
	);

	const goal = new Setting(card)
		.setName('Goal template')
		.setDesc('Copied into new goals.');
	noteSetting(goal, {
		app: plugin.app,
		value: settings.goalTemplate,
		placeholder: 'Built-in goal template',
		normalize,
		commit: (path) => plugin.updateSettings({ goalTemplate: path }),
	});

	const project = new Setting(card)
		.setName('Project template')
		.setDesc('Used when a goal has no project template of its own.');
	noteSetting(project, {
		app: plugin.app,
		value: settings.projectTemplate,
		placeholder: 'Built-in project template',
		normalize,
		commit: (path) => plugin.updateSettings({ projectTemplate: path }),
	});

	const author = new Setting(card)
		.setName('Author template')
		.setDesc('Used when a linked author note is missing.');
	noteSetting(author, {
		app: plugin.app,
		value: settings.authorTemplate,
		placeholder: 'Built-in author template',
		normalize,
		commit: (path) => plugin.updateSettings({ authorTemplate: path }),
	});

	const starter = group(containerEl, 'Starter templates');
	noteParagraph(
		starter,
		'Pick where the starter templates are written, then create them. Existing files are left alone.',
	);

	const folder = new Setting(starter)
		.setName('Template folder')
		.setDesc('Where starter and per-goal project templates are stored.');
	folderSetting(folder, {
		app: plugin.app,
		value: settings.templateFolder,
		placeholder: 'templates',
		normalize: folderNormalizer(plugin),
		commit: (path) => plugin.updateSettings({ templateFolder: path }),
	});

	const create = new Setting(starter)
		.setName('Create starter templates')
		.setDesc(
			'Write editable goal, project, and author templates into the folder above.',
		);
	create.addButton((button) =>
		button.setButtonText('Create').onClick(() => {
			void plugin
				.createStarterTemplates()
				.then((result) => {
					announceStarterResult(result);
					host.refresh();
				})
				.catch(announceStarterError);
		}),
	);
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
		defaults: DEFAULT_GOAL_CATEGORIES,
		placeholder: 'New category',
		onChange: (values) => plugin.updateSettings({ goalCategories: values }),
	});

	renderListEditor({
		containerEl,
		name: 'Project statuses',
		desc: 'Suggestions for the status picker when creating a project.',
		values: settings.projectStatuses,
		defaults: DEFAULT_PROJECT_STATUSES,
		placeholder: 'New status',
		onChange: (values) => plugin.updateSettings({ projectStatuses: values }),
	});

	renderListEditor({
		containerEl,
		name: 'Authors',
		desc: 'Suggestions for the author picker when creating or editing a project.',
		values: settings.authors,
		defaults: [],
		placeholder: 'New author',
		onChange: (values) => plugin.updateSettings({ authors: values }),
	});
}
