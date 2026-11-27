import { describe, expect, it } from 'vitest';
import {
	DEFAULT_GOAL_CATEGORIES,
	DEFAULT_PROJECT_STATUSES,
	DEFAULT_SETTINGS,
	appearanceChanged,
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
		expect(config.authorFolder).toBe('authors');
		expect(config.templateFolder).toBe('templates');
		expect(config.goalTemplate).toBe('');
		expect(config.projectTemplate).toBe('');
		expect(config.authorTemplate).toBe('');
		expect(config.goalTag).toBe('goal');
		expect(config.projectTag).toBe('project');
		expect(config.goalCategories).toEqual(DEFAULT_GOAL_CATEGORIES);
		expect(config.projectStatuses).toEqual(DEFAULT_PROJECT_STATUSES);
		expect(config.authors).toEqual([]);
		expect(config.authorWikilink).toBe(false);
		expect(config.progressMode).toBe('auto');
		expect(config.taskScope).toEqual({ type: 'all' });
		expect(config.useTimekeep).toBe(true);
		expect(config.openAfterCreate).toBe(true);
		expect(config.progressBarStyle).toBe('threshold');
		expect(config.goalProjectsStyle).toBe('minimal');
		expect(config.trackedTimeFormat).toBe('decimal');
		expect(config.dashboardStyle).toBe('minimal');
		expect(config.goalsStyle).toBe('board');
		expect(config.projectsStyle).toBe('board');
		expect(config.boardDirection).toBe('horizontal');
		expect(config.skipControlsToBoard).toBe(false);
	});

	it('uses the reference lanes in order by default', () => {
		const config = resolveConfig({});

		expect(config.goalCategories).toEqual([
			'Physical',
			'Knowledge',
			'Life',
			'Professional',
			'Wealth',
		]);
		expect(config.projectStatuses).toEqual([
			'Todo',
			'Waiting',
			'In Progress',
			'Completed',
			'Discarded',
		]);
	});

	it('keeps stored category and status lists in their saved order', () => {
		const config = resolveConfig({
			goalCategories: ['Wealth', 'Life'],
			projectStatuses: ['Waiting', 'Todo'],
		});

		expect(config.goalCategories).toEqual(['Wealth', 'Life']);
		expect(config.projectStatuses).toEqual(['Waiting', 'Todo']);
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
			authors: [' Aaqil ', 'aaqil', '', 'Sam'],
		});

		expect(config.goalCategories).toEqual(['Work', 'Health']);
		expect(config.projectStatuses).toEqual(['Done', 'In Progress']);
		expect(config.authors).toEqual(['Aaqil', 'Sam']);
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
			skipControlsToBoard: true,
			authorWikilink: true,
		});

		expect(config.useTimekeep).toBe(false);
		expect(config.openAfterCreate).toBe(true);
		expect(config.skipControlsToBoard).toBe(true);
		expect(config.authorWikilink).toBe(true);
	});

	it('accepts the known progress bar styles and falls back otherwise', () => {
		expect(resolveConfig({ progressBarStyle: 'normal' }).progressBarStyle).toBe(
			'normal',
		);
		expect(
			resolveConfig({ progressBarStyle: 'multicolor' }).progressBarStyle,
		).toBe('multicolor');
		expect(
			resolveConfig({ progressBarStyle: 'threshold' }).progressBarStyle,
		).toBe('threshold');

		const invalid = resolveConfig({
			progressBarStyle:
				'sparkles' as typeof DEFAULT_SETTINGS.progressBarStyle,
		});

		expect(invalid.progressBarStyle).toBe('threshold');
	});

	it('accepts the goal projects styles and falls back otherwise', () => {
		expect(
			resolveConfig({ goalProjectsStyle: 'compact' }).goalProjectsStyle,
		).toBe('compact');
		expect(
			resolveConfig({ goalProjectsStyle: 'table' }).goalProjectsStyle,
		).toBe('table');
		expect(
			resolveConfig({ goalProjectsStyle: 'cards' }).goalProjectsStyle,
		).toBe('cards');
		expect(
			resolveConfig({ goalProjectsStyle: 'dashboard' }).goalProjectsStyle,
		).toBe('dashboard');

		const invalid = resolveConfig({
			goalProjectsStyle:
				'list' as typeof DEFAULT_SETTINGS.goalProjectsStyle,
		});

		expect(invalid.goalProjectsStyle).toBe('minimal');
	});

	it('accepts the tracked time formats and falls back otherwise', () => {
		expect(
			resolveConfig({ trackedTimeFormat: 'readable' }).trackedTimeFormat,
		).toBe('readable');
		expect(
			resolveConfig({ trackedTimeFormat: 'decimal' }).trackedTimeFormat,
		).toBe('decimal');

		const invalid = resolveConfig({
			trackedTimeFormat:
				'clock' as typeof DEFAULT_SETTINGS.trackedTimeFormat,
		});

		expect(invalid.trackedTimeFormat).toBe('decimal');
	});

	it('accepts the dashboard styles and falls back otherwise', () => {
		expect(resolveConfig({ dashboardStyle: 'minimal' }).dashboardStyle).toBe(
			'minimal',
		);
		expect(resolveConfig({ dashboardStyle: 'cards' }).dashboardStyle).toBe(
			'cards',
		);
		expect(
			resolveConfig({ dashboardStyle: 'timeline' }).dashboardStyle,
		).toBe('timeline');

		const invalid = resolveConfig({
			dashboardStyle:
				'fancy' as typeof DEFAULT_SETTINGS.dashboardStyle,
		});

		expect(invalid.dashboardStyle).toBe('minimal');
	});

	it('accepts the goals styles and falls back otherwise', () => {
		expect(resolveConfig({ goalsStyle: 'list' }).goalsStyle).toBe('list');
		expect(resolveConfig({ goalsStyle: 'cards' }).goalsStyle).toBe('cards');
		expect(resolveConfig({ goalsStyle: 'board' }).goalsStyle).toBe('board');

		const invalid = resolveConfig({
			goalsStyle: 'fancy' as typeof DEFAULT_SETTINGS.goalsStyle,
		});

		expect(invalid.goalsStyle).toBe('board');
	});

	it('accepts the projects styles and falls back otherwise', () => {
		expect(resolveConfig({ projectsStyle: 'table' }).projectsStyle).toBe(
			'table',
		);
		expect(resolveConfig({ projectsStyle: 'cards' }).projectsStyle).toBe(
			'cards',
		);
		expect(resolveConfig({ projectsStyle: 'board' }).projectsStyle).toBe(
			'board',
		);

		const invalid = resolveConfig({
			projectsStyle: 'fancy' as typeof DEFAULT_SETTINGS.projectsStyle,
		});

		expect(invalid.projectsStyle).toBe('board');
	});

	it('accepts the board directions and falls back otherwise', () => {
		expect(
			resolveConfig({ boardDirection: 'horizontal' }).boardDirection,
		).toBe('horizontal');
		expect(resolveConfig({ boardDirection: 'vertical' }).boardDirection).toBe(
			'vertical',
		);

		const invalid = resolveConfig({
			boardDirection:
				'sideways' as typeof DEFAULT_SETTINGS.boardDirection,
		});

		expect(invalid.boardDirection).toBe('horizontal');
	});

	it('detects every repaint-only appearance change', () => {
		const base = resolveConfig(DEFAULT_SETTINGS);
		const changes = [
			resolveConfig({ progressBarStyle: 'normal' }),
			resolveConfig({ goalProjectsStyle: 'dashboard' }),
			resolveConfig({ trackedTimeFormat: 'readable' }),
			resolveConfig({ useTimekeep: false }),
			resolveConfig({ dashboardStyle: 'cards' }),
			resolveConfig({ goalsStyle: 'list' }),
			resolveConfig({ goalsStyle: 'cards' }),
			resolveConfig({ projectsStyle: 'table' }),
			resolveConfig({ projectsStyle: 'cards' }),
			resolveConfig({ boardDirection: 'vertical' }),
			resolveConfig({ skipControlsToBoard: true }),
			resolveConfig({ goalCategories: ['Health'] }),
		];

		for (const next of changes) {
			expect(appearanceChanged(base, next)).toBe(true);
		}

		expect(appearanceChanged(base, base)).toBe(false);
		expect(
			appearanceChanged(base, resolveConfig({ goalFolder: 'elsewhere' })),
		).toBe(false);
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
