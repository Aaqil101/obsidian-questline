import { Setting, type SettingDefinitionGroup } from 'obsidian';
import { ValueSuggest } from '../creation/suggest';
import {
	DEFAULT_GOAL_FILENAME,
	DEFAULT_PROJECT_FILENAME,
	type ProgressMode,
	type TaskScopeMode,
} from './types';
import {
	group,
	noteParagraph,
	pageDefinition,
	type SettingsHost,
} from './ui';

const FILENAME_TOKENS =
	'Tokens: {{title}}, {{goal_name}}, {{date}}, {{date:FORMAT}}, {{time}}, {{time:FORMAT}}, {{created}}.';

/** Landing group: the two creation sub-pages. */
export function creationGroup(host: SettingsHost): SettingDefinitionGroup {
	return {
		type: 'group',
		heading: 'Creating notes',
		items: [
			pageDefinition(
				host,
				'Defaults',
				'Filename patterns, default author, and whether a new note opens.',
				renderDefaultsPage,
			),
			pageDefinition(
				host,
				'Progress',
				'How progress is measured, and which tasks count.',
				renderProgressPage,
			),
		],
	};
}

/** Defaults sub-page: what a new goal or project starts with. */
function renderDefaultsPage(
	host: SettingsHost,
	containerEl: HTMLElement,
): void {
	const { plugin } = host;
	const { settings } = plugin;
	const card = group(containerEl, 'Defaults');

	new Setting(card)
		.setName('Default author')
		.setDesc('Used when a new goal or project has no author.')
		.addText((text) => {
			text
				.setPlaceholder('Your name')
				.setValue(settings.defaultAuthor)
				.onChange((value) => {
					void plugin.updateSettings({ defaultAuthor: value });
				});
			const authors = [
				...new Set(
					[...settings.authors, settings.defaultAuthor].filter(
						(name) => name.trim() !== '',
					),
				),
			];
			new ValueSuggest(plugin.app, text.inputEl, authors);
		});

	new Setting(card)
		.setName('Link authors as wikilinks')
		.setDesc('Save project authors as [[author]] links.')
		.addToggle((toggle) =>
			toggle
				.setValue(settings.authorWikilink)
				.onChange((value) => {
					void plugin.updateSettings({ authorWikilink: value });
				}),
		);

	new Setting(card)
		.setName('Goal filename pattern')
		.setDesc(`${FILENAME_TOKENS} Default: ${DEFAULT_GOAL_FILENAME}`)
		.addText((text) =>
			text
				.setPlaceholder(DEFAULT_GOAL_FILENAME)
				.setValue(settings.goalFilename)
				.onChange((value) => {
					void plugin.updateSettings({ goalFilename: value });
				}),
		);

	new Setting(card)
		.setName('Project filename pattern')
		.setDesc(
			`${FILENAME_TOKENS} Default: ${DEFAULT_PROJECT_FILENAME}. ` +
				'{{goal_name}} is dropped when a project has no goal.',
		)
		.addText((text) =>
			text
				.setPlaceholder(DEFAULT_PROJECT_FILENAME)
				.setValue(settings.projectFilename)
				.onChange((value) => {
					void plugin.updateSettings({ projectFilename: value });
				}),
		);

	new Setting(card)
		.setName('Open after creating')
		.setDesc('Open a new goal or project in a new tab when it is created.')
		.addToggle((toggle) =>
			toggle.setValue(settings.openAfterCreate).onChange((value) => {
				void plugin.updateSettings({ openAfterCreate: value });
			}),
		);
}

/** Progress sub-page: mode and task scope. */
function renderProgressPage(
	host: SettingsHost,
	containerEl: HTMLElement,
): void {
	const { plugin } = host;
	const { settings } = plugin;
	const card = group(containerEl, 'Progress');

	noteParagraph(
		card,
		'Auto uses manual progress and target fields when present, otherwise it counts tasks.',
	);

	new Setting(card)
		.setName('Progress mode')
		.addDropdown((dropdown) =>
			dropdown
				.addOption('auto', 'Auto')
				.addOption('tasks', 'Tasks')
				.addOption('manual', 'Manual fields')
				.setValue(settings.progressMode)
				.onChange((value) => {
					const progressMode: ProgressMode =
						value === 'tasks' || value === 'manual' ? value : 'auto';
					void plugin.updateSettings({ progressMode });
				}),
		);

	new Setting(card)
		.setName('Task scope')
		.setDesc(
			'Choose whether every task counts or only the tasks under one heading.',
		)
		.addDropdown((dropdown) =>
			dropdown
				.addOption('all', 'All tasks')
				.addOption('heading', 'Under a heading')
				.setValue(settings.taskScopeMode)
				.onChange((value) => {
					const taskScopeMode: TaskScopeMode =
						value === 'heading' ? 'heading' : 'all';
					void plugin.updateSettings({ taskScopeMode });
				}),
		);

	new Setting(card)
		.setName('Scope heading')
		.setDesc(
			'Only used when the task scope is under a heading. Leave it blank to count every task.',
		)
		.addText((text) =>
			text
				.setPlaceholder('Tasks')
				.setValue(settings.taskScopeHeading)
				.onChange((value) => {
					void plugin.updateSettings({ taskScopeHeading: value });
				}),
		);
}
