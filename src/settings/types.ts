import { normalizeTag } from '../fields/values';
import { ALL_TASKS, type TaskScope } from '../progress/tasks';

/** How a goal decides its progress. `auto` lets manual fields win. */
export type ProgressMode = 'auto' | 'tasks' | 'manual';

/** How the progress bar fill is painted. */
export type ProgressBarStyle =
	| 'rainbow'
	| 'multicolor'
	| 'normal'
	| 'threshold';

/** How the goal-projects block lists linked projects. */
export type GoalProjectsStyle =
	| 'minimal'
	| 'compact'
	| 'table'
	| 'cards'
	| 'dashboard';

/** How tracked hours are displayed. */
export type TrackedTimeFormat = 'decimal' | 'readable';

/** How the dashboard is laid out. */
export type DashboardStyle = 'minimal' | 'cards' | 'timeline';

/** How the Goals tab lists goals. */
export type GoalsStyle = 'list' | 'cards';

/** How the Projects tab lists projects. */
export type ProjectsStyle = 'table' | 'cards';

/** Whether progress counts every task or only the tasks under one heading. */
export type TaskScopeMode = 'all' | 'heading';

/** Stored settings. Every field is safe to edit from the settings tab. */
export interface QuestlineSettings {
	goalFolder: string;
	projectFolder: string;
	templateFolder: string;
	/** Vault path of the global goal template, or blank for the built-in one. */
	goalTemplate: string;
	/** Vault path of the global project template, or blank for the built-in one. */
	projectTemplate: string;
	goalTag: string;
	projectTag: string;
	goalCategories: string[];
	projectStatuses: string[];
	defaultAuthor: string;
	goalFilename: string;
	projectFilename: string;
	progressMode: ProgressMode;
	taskScopeMode: TaskScopeMode;
	taskScopeHeading: string;
	useTimekeep: boolean;
	openAfterCreate: boolean;
	progressBarStyle: ProgressBarStyle;
	goalProjectsStyle: GoalProjectsStyle;
	trackedTimeFormat: TrackedTimeFormat;
	dashboardStyle: DashboardStyle;
	goalsStyle: GoalsStyle;
	projectsStyle: ProjectsStyle;
}

export const DEFAULT_GOAL_CATEGORIES = [
	'Professional',
	'Personal',
	'Learning',
	'Health',
	'Finance',
];

export const DEFAULT_PROJECT_STATUSES = [
	'Todo',
	'In Progress',
	'Completed',
	'On Hold',
];

/** Goal notes are dated by default so they sort chronologically. */
export const DEFAULT_GOAL_FILENAME = '{{date:YYYY-MM-DD}} - {{title}}';

/** Projects lead with their goal, so the goal is visible in the filename. */
export const DEFAULT_PROJECT_FILENAME = '{{goal_name}} - {{title}}';

export const DEFAULT_GOAL_FOLDER = 'goals';
export const DEFAULT_PROJECT_FOLDER = 'projects';
export const DEFAULT_TEMPLATE_FOLDER = 'templates';

export const DEFAULT_SETTINGS: QuestlineSettings = {
	goalFolder: DEFAULT_GOAL_FOLDER,
	projectFolder: DEFAULT_PROJECT_FOLDER,
	templateFolder: DEFAULT_TEMPLATE_FOLDER,
	goalTemplate: '',
	projectTemplate: '',
	goalTag: 'goal',
	projectTag: 'project',
	goalCategories: [...DEFAULT_GOAL_CATEGORIES],
	projectStatuses: [...DEFAULT_PROJECT_STATUSES],
	defaultAuthor: '',
	goalFilename: DEFAULT_GOAL_FILENAME,
	projectFilename: DEFAULT_PROJECT_FILENAME,
	progressMode: 'auto',
	taskScopeMode: 'all',
	taskScopeHeading: 'Tasks',
	useTimekeep: true,
	openAfterCreate: true,
	progressBarStyle: 'rainbow',
	goalProjectsStyle: 'minimal',
	trackedTimeFormat: 'decimal',
	dashboardStyle: 'minimal',
	goalsStyle: 'list',
	projectsStyle: 'table',
};

/**
 * Validated settings. Creation, the index, and the renderers all read this
 * shape, so a bad stored value can never reach the vault.
 */
export interface QuestlineConfig {
	goalFolder: string;
	projectFolder: string;
	templateFolder: string;
	goalTemplate: string;
	projectTemplate: string;
	goalTag: string;
	projectTag: string;
	goalCategories: readonly string[];
	projectStatuses: readonly string[];
	defaultAuthor: string;
	goalFilename: string;
	projectFilename: string;
	progressMode: ProgressMode;
	taskScope: TaskScope;
	useTimekeep: boolean;
	openAfterCreate: boolean;
	progressBarStyle: ProgressBarStyle;
	goalProjectsStyle: GoalProjectsStyle;
	trackedTimeFormat: TrackedTimeFormat;
	dashboardStyle: DashboardStyle;
	goalsStyle: GoalsStyle;
	projectsStyle: ProjectsStyle;
}

export type FolderKind = 'folder' | 'file' | 'missing';
export type FolderCheck = (path: string) => FolderKind;

/**
 * Normalize a vault-relative folder. Backslashes become slashes, duplicate
 * and surrounding slashes go away, and paths that try to leave the vault are
 * rejected with an empty string.
 */
export function normalizeFolder(value: unknown): string {
	if (typeof value !== 'string') return '';

	const segments = value
		.trim()
		.replace(/\\/g, '/')
		.split('/')
		.filter((segment) => segment && segment !== '.');

	if (segments.some((segment) => segment === '..' || segment.includes(':'))) {
		return '';
	}

	return segments.join('/');
}

/**
 * A template setting points at one note. Blank means the built-in template.
 * A path that cannot be inside the vault falls back to blank, and the `.md`
 * suffix is dropped so the same note always stores the same way.
 */
export function normalizeTemplate(value: unknown): string {
	if (typeof value !== 'string') return '';

	return normalizeFolder(value).replace(/\.md$/i, '');
}

/** Tags are stored without a hash and compared case-insensitively. */
export function normalizeTagSetting(value: unknown, fallback: string): string {
	const tag = normalizeTag(typeof value === 'string' ? value : '');

	return tag || fallback;
}

function cleanList(value: unknown, fallback: readonly string[]): string[] {
	if (!Array.isArray(value)) return [...fallback];

	const seen = new Set<string>();
	const list: string[] = [];

	for (const item of value) {
		if (typeof item !== 'string') continue;

		const text = item.trim();
		const key = text.toLowerCase();
		if (!text || seen.has(key)) continue;

		seen.add(key);
		list.push(text);
	}

	return list;
}

function cleanText(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function cleanProgressMode(value: unknown): ProgressMode {
	return value === 'tasks' || value === 'manual' || value === 'auto'
		? value
		: DEFAULT_SETTINGS.progressMode;
}

function cleanProgressBarStyle(value: unknown): ProgressBarStyle {
	return value === 'multicolor' ||
		value === 'normal' ||
		value === 'rainbow' ||
		value === 'threshold'
		? value
		: DEFAULT_SETTINGS.progressBarStyle;
}

function cleanGoalProjectsStyle(value: unknown): GoalProjectsStyle {
	return value === 'compact' ||
		value === 'table' ||
		value === 'cards' ||
		value === 'dashboard' ||
		value === 'minimal'
		? value
		: DEFAULT_SETTINGS.goalProjectsStyle;
}

function cleanTrackedTimeFormat(value: unknown): TrackedTimeFormat {
	return value === 'readable' || value === 'decimal'
		? value
		: DEFAULT_SETTINGS.trackedTimeFormat;
}

function cleanDashboardStyle(value: unknown): DashboardStyle {
	return value === 'minimal' ||
		value === 'cards' ||
		value === 'timeline'
		? value
		: DEFAULT_SETTINGS.dashboardStyle;
}

function cleanGoalsStyle(value: unknown): GoalsStyle {
	return value === 'list' || value === 'cards'
		? value
		: DEFAULT_SETTINGS.goalsStyle;
}

function cleanProjectsStyle(value: unknown): ProjectsStyle {
	return value === 'table' || value === 'cards'
		? value
		: DEFAULT_SETTINGS.projectsStyle;
}

function cleanTaskScope(mode: unknown, heading: unknown): TaskScope {
	const name = typeof heading === 'string' ? heading.trim() : '';
	if (mode !== 'heading' || !name) return ALL_TASKS;

	return { type: 'heading', heading: name };
}

/**
 * A blank folder means the vault root on purpose. A path that points at a
 * note, or that cannot be inside the vault, falls back to the root instead of
 * writing somewhere unexpected. A folder that does not exist yet is kept,
 * because creation makes it on first use.
 */
function safeFolder(
	value: unknown,
	fallback: string,
	checkFolder: FolderCheck,
): string {
	if (typeof value !== 'string') return fallback;
	if (!value.trim()) return '';

	const path = normalizeFolder(value);
	if (!path) return '';
	if (checkFolder(path) === 'file') return '';

	return path;
}

/** Turn stored settings into the validated config every feature reads. */
export function resolveConfig(
	settings: Partial<QuestlineSettings> | null | undefined,
	checkFolder: FolderCheck = () => 'missing',
): QuestlineConfig {
	const stored = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };

	return {
		goalFolder: safeFolder(
			stored.goalFolder,
			DEFAULT_GOAL_FOLDER,
			checkFolder,
		),
		projectFolder: safeFolder(
			stored.projectFolder,
			DEFAULT_PROJECT_FOLDER,
			checkFolder,
		),
		templateFolder: safeFolder(
			stored.templateFolder,
			DEFAULT_TEMPLATE_FOLDER,
			checkFolder,
		),
		goalTemplate: normalizeTemplate(stored.goalTemplate),
		projectTemplate: normalizeTemplate(stored.projectTemplate),
		goalTag: normalizeTagSetting(stored.goalTag, DEFAULT_SETTINGS.goalTag),
		projectTag: normalizeTagSetting(
			stored.projectTag,
			DEFAULT_SETTINGS.projectTag,
		),
		goalCategories: cleanList(
			stored.goalCategories,
			DEFAULT_GOAL_CATEGORIES,
		),
		projectStatuses: cleanList(
			stored.projectStatuses,
			DEFAULT_PROJECT_STATUSES,
		),
		defaultAuthor: cleanText(stored.defaultAuthor, ''),
		goalFilename: cleanText(stored.goalFilename, DEFAULT_GOAL_FILENAME),
		projectFilename: cleanText(
			stored.projectFilename,
			DEFAULT_PROJECT_FILENAME,
		),
		progressMode: cleanProgressMode(stored.progressMode),
		taskScope: cleanTaskScope(stored.taskScopeMode, stored.taskScopeHeading),
		useTimekeep: cleanBoolean(stored.useTimekeep, DEFAULT_SETTINGS.useTimekeep),
		openAfterCreate: cleanBoolean(
			stored.openAfterCreate,
			DEFAULT_SETTINGS.openAfterCreate,
		),
		progressBarStyle: cleanProgressBarStyle(stored.progressBarStyle),
		goalProjectsStyle: cleanGoalProjectsStyle(stored.goalProjectsStyle),
		trackedTimeFormat: cleanTrackedTimeFormat(stored.trackedTimeFormat),
		dashboardStyle: cleanDashboardStyle(stored.dashboardStyle),
		goalsStyle: cleanGoalsStyle(stored.goalsStyle),
		projectsStyle: cleanProjectsStyle(stored.projectsStyle),
	};
}

/** Used when the index runs without settings, such as in tests. */
export const DEFAULT_CONFIG: QuestlineConfig = resolveConfig(DEFAULT_SETTINGS);

/**
 * True when a config change only affects how open views paint. These settings
 * never change what the index holds, so views repaint without a rebuild.
 */
export function appearanceChanged(
	previous: QuestlineConfig,
	next: QuestlineConfig,
): boolean {
	return (
		next.progressBarStyle !== previous.progressBarStyle ||
		next.goalProjectsStyle !== previous.goalProjectsStyle ||
		next.trackedTimeFormat !== previous.trackedTimeFormat ||
		next.useTimekeep !== previous.useTimekeep ||
		next.dashboardStyle !== previous.dashboardStyle ||
		next.goalsStyle !== previous.goalsStyle ||
		next.projectsStyle !== previous.projectsStyle ||
		!sameStrings(next.goalCategories, previous.goalCategories)
	);
}

function sameStrings(
	left: readonly string[],
	right: readonly string[],
): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

/** Human-readable folder state for the settings tab. */
export function describeFolder(
	value: string,
	checkFolder: FolderCheck,
): string {
	if (!value.trim()) return 'Vault root.';

	const path = normalizeFolder(value);
	if (!path) return 'Invalid path. Falls back to the vault root.';

	const kind = checkFolder(path);
	if (kind === 'file') {
		return 'A note uses this path. Falls back to the vault root.';
	}

	return kind === 'folder'
		? 'Folder exists.'
		: 'Will be created when first used.';
}
