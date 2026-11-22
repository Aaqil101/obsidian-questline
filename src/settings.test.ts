import { describe, expect, it } from 'vitest';
import {
	DEFAULT_GOAL_CATEGORIES,
	DEFAULT_PROJECT_STATUSES,
	DEFAULT_SETTINGS,
	describeFolder,
	normalizeFolder,
	normalizeTemplate,
	resolveConfig,
} from './settings/types';

describe('normalizeFolder', () => {
	it('normalizes slashes and surrounding separators', () => {
		expect(normalizeFolder('/goals/')).toBe('goals');
		expect(normalizeFolder('goals\\2026')).toBe('goals/2026');
		expect(normalizeFolder(' goals//2026 ')).toBe('goals/2026');
		expect(normalizeFolder('./goals')).toBe('goals');
	});

	it('rejects paths that leave the vault or are absolute', () => {
		expect(normalizeFolder('../outside')).toBe('');
		expect(normalizeFolder('goals/../../outside')).toBe('');
		expect(normalizeFolder('C:\\Vault\\goals')).toBe('');
	});

	it('treats blank input as the vault root', () => {
		expect(normalizeFolder('')).toBe('');
		expect(normalizeFolder('   ')).toBe('');
	});
});

describe('resolveConfig', () => {
	it('fills defaults from stored settings', () => {
		const config = resolveConfig({});

		expect(config.goalFolder).toBe('goals');
		expect(config.projectFolder).toBe('projects');
		expect(config.templateFolder).toBe('templates');
		expect(config.goalTemplate).toBe('');
		expect(config.projectTemplate).toBe('');
		expect(config.goalTag).toBe('goal');
		expect(config.projectTag).toBe('project');
		expect(config.goalCategories).toEqual(DEFAULT_GOAL_CATEGORIES);
		expect(config.projectStatuses).toEqual(DEFAULT_PROJECT_STATUSES);
		expect(config.progressMode).toBe('auto');
		expect(config.taskScope).toEqual({ type: 'all' });
		expect(config.useTimekeep).toBe(true);
		expect(config.openAfterCreate).toBe(true);
	});

	it('normalizes custom tags and falls back when they are blank', () => {
		const custom = resolveConfig({ goalTag: ' #Outcome ', projectTag: '#Effort' });
		const blank = resolveConfig({ goalTag: '  ', projectTag: '#' });

		expect(custom.goalTag).toBe('outcome');
		expect(custom.projectTag).toBe('effort');
		expect(blank.goalTag).toBe('goal');
		expect(blank.projectTag).toBe('project');
	});

	it('keeps a folder that does not exist yet so creation can make it', () => {
		const config = resolveConfig({ goalFolder: 'Outcomes/2026' }, () => 'missing');

		expect(config.goalFolder).toBe('Outcomes/2026');
	});

	it('falls back to the vault root when a note uses the folder path', () => {
		const config = resolveConfig(
			{ goalFolder: 'goals', projectFolder: 'projects' },
			(path) => (path === 'goals' ? 'file' : 'folder'),
		);

		expect(config.goalFolder).toBe('');
		expect(config.projectFolder).toBe('projects');
	});

	it('treats a blank folder as the vault root on purpose', () => {
		expect(resolveConfig({ goalFolder: '' }).goalFolder).toBe('');
	});

	it('trims and deduplicates list values without reordering', () => {
		const config = resolveConfig({
			goalCategories: [' Work ', 'work', '', 'Health'],
			projectStatuses: ['Done', 'Done', 'In Progress'],
		});

		expect(config.goalCategories).toEqual(['Work', 'Health']);
		expect(config.projectStatuses).toEqual(['Done', 'In Progress']);
	});

	it('keeps an explicitly empty list empty', () => {
		const config = resolveConfig({ goalCategories: [], projectStatuses: [] });

		expect(config.goalCategories).toEqual([]);
		expect(config.projectStatuses).toEqual([]);
	});

	it('falls back for unreadable modes and headings', () => {
		const config = resolveConfig({
			progressMode: 'sometimes' as typeof DEFAULT_SETTINGS.progressMode,
			taskScopeMode: 'heading',
			taskScopeHeading: '   ',
		});

		expect(config.progressMode).toBe('auto');
		expect(config.taskScope).toEqual({ type: 'all' });
	});

	it('uses the scope heading when it is set', () => {
		const config = resolveConfig({
			taskScopeMode: 'heading',
			taskScopeHeading: ' Next actions ',
		});

		expect(config.taskScope).toEqual({
			type: 'heading',
			heading: 'Next actions',
		});
	});

	it('falls back for blank filename patterns and trims values', () => {
		const config = resolveConfig({
			goalFilename: '  ',
			projectFilename: ' {{title}} ',
			defaultAuthor: ' Aaqil ',
		});

		expect(config.goalFilename).toBe(DEFAULT_SETTINGS.goalFilename);
		expect(config.projectFilename).toBe('{{title}}');
		expect(config.defaultAuthor).toBe('Aaqil');
	});

	it('keeps booleans and falls back for non-boolean values', () => {
		const config = resolveConfig({
			useTimekeep: false,
			openAfterCreate: 'yes' as unknown as boolean,
		});

		expect(config.useTimekeep).toBe(false);
		expect(config.openAfterCreate).toBe(true);
	});

	it('normalizes template note paths', () => {
		const config = resolveConfig({
			goalTemplate: ' templates\\Goal template.md ',
			projectTemplate: '../outside.md',
		});

		expect(config.goalTemplate).toBe('templates/Goal template');
		expect(config.projectTemplate).toBe('');
	});
});

describe('normalizeTemplate', () => {
	it('strips the extension and normalizes separators', () => {
		expect(normalizeTemplate('templates/Goal Template.md')).toBe(
			'templates/Goal Template',
		);
		expect(normalizeTemplate('/templates//Goal.md/')).toBe('templates/Goal');
	});

	it('treats blank input as no template', () => {
		expect(normalizeTemplate('')).toBe('');
		expect(normalizeTemplate(42)).toBe('');
	});

	it('rejects a path that leaves the vault', () => {
		expect(normalizeTemplate('../outside.md')).toBe('');
		expect(normalizeTemplate('C:\\Vault\\Goal.md')).toBe('');
	});
});

describe('describeFolder', () => {
	it('reports the state the settings tab shows', () => {
		expect(describeFolder('', () => 'missing')).toBe('Vault root.');
		expect(describeFolder('../outside', () => 'missing')).toContain('Invalid');
		expect(describeFolder('notes.md', () => 'file')).toContain('note uses');
		expect(describeFolder('goals', () => 'folder')).toBe('Folder exists.');
		expect(describeFolder('goals', () => 'missing')).toContain(
			'created when first used',
		);
	});
});
