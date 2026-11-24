/**
 * Markdown code blocks that render live progress. Each block subscribes to
 * index refreshes, so a checkbox or frontmatter change repaints in place.
 * The same processors run in Reading view and Live Preview.
 */
import { MarkdownRenderChild } from 'obsidian';
import type QuestlinePlugin from '../main';
import type { ProgressBarStyle, QuestlineConfig } from '../settings/types';
import {
	describeDue,
	formatHours,
	goalProgressView,
	goalProjectsView,
	projectProgressView,
	type GoalProjectItem,
} from './model';
import { revealOrOpen } from './open';
import {
	DEFAULT_PROJECT_DIRECTION,
	DEFAULT_PROJECT_SORT,
	NO_STATUS_FILTER,
	PROJECT_SORT_OPTIONS,
	compareText,
	dashboardStats,
	filterGoalProjects,
	formatTrackedHours,
	projectAuthor,
	sortGoalProjects,
	type ProjectDirection,
	type ProjectSort,
	type TimeFormat,
} from './projects';
import {
	countLabel,
	renderEmpty,
	renderProgressRow,
	renderStats,
	type Stat,
} from './render';

const NOT_A_GOAL =
	'This note is not a goal. Add the goal tag to show progress.';
const NO_GOAL_DATA =
	'No progress yet. Add tasks, link a project, or set manual progress.';
const NO_GOAL_PROJECTS =
	'No projects yet. Create a project linked to this goal.';
const NO_PROJECT_MATCHES =
	'No projects match the current filters.';
const NOT_A_PROJECT =
	'This note is not a project. Add the project tag and a status to show progress.';
const NO_PROJECT_TASKS =
	'No tasks yet. Add a task to start tracking progress.';

abstract class QuestlineBlock extends MarkdownRenderChild {
	private unsubscribe: (() => void) | null = null;

	constructor(
		containerEl: HTMLElement,
		protected readonly plugin: QuestlinePlugin,
		protected readonly sourcePath: string,
	) {
		super(containerEl);
	}

	onload(): void {
		this.unsubscribe = this.plugin.onIndexRefresh(() => this.paint());
		this.paint();
	}

	onunload(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	protected abstract paintBlock(containerEl: HTMLElement): void;

	private paint(): void {
		this.containerEl.empty();
		this.containerEl.addClass('questline-block');
		this.paintBlock(this.containerEl);
	}
}

class GoalProgressBlock extends QuestlineBlock {
	protected paintBlock(containerEl: HTMLElement): void {
		const index = this.plugin.getIndex();
		const goal = index.goalByPath.get(this.sourcePath);

		if (!goal) {
			renderEmpty(containerEl, NOT_A_GOAL);

			return;
		}

		const config = this.plugin.getConfig();
		const view = goalProgressView(index, goal, config, new Date());

		if (view.empty) {
			renderEmpty(containerEl, NO_GOAL_DATA);

			return;
		}

		renderProgressRow(
			containerEl,
			view.counts.percent,
			`Goal progress: ${view.name}`,
			config.progressBarStyle,
		);
		renderStats(containerEl, [
			`${view.counts.completed} / ${view.counts.total} tasks`,
			countLabel(view.projectCount, 'project', 'projects'),
			describeDue(view.due),
		]);
	}
}

class ProjectProgressBlock extends QuestlineBlock {
	protected paintBlock(containerEl: HTMLElement): void {
		const index = this.plugin.getIndex();
		const project = index.projectByPath.get(this.sourcePath);

		if (!project) {
			renderEmpty(containerEl, NOT_A_PROJECT);

			return;
		}

		const config = this.plugin.getConfig();
		const view = projectProgressView(index, project, config, new Date());

		if (view.empty) {
			renderEmpty(containerEl, NO_PROJECT_TASKS);
		} else {
			renderProgressRow(
				containerEl,
				view.counts.percent,
				`Project progress: ${view.name}`,
				config.progressBarStyle,
			);
		}

		const stats: Stat[] = [];
		if (!view.empty) {
			stats.push(
				`${view.counts.completed} / ${view.counts.total} tasks`,
			);
		}
		stats.push(`Status: ${view.status ?? 'No status'}`);
		stats.push(
			view.goal
				? { text: `Goal: ${view.goal.name}`, path: view.goal.path }
				: 'No goal',
		);
		if (view.workHours !== null) {
			stats.push(`${formatHours(view.workHours)} tracked`);
		}

		renderStats(containerEl, stats, (path, event) => {
			revealOrOpen(this.plugin.app, path, event, this.sourcePath);
		});
	}
}

type OpenProject = (path: string, event: MouseEvent) => void;

function projectProgressText(project: GoalProjectItem): string {
	return project.counts.total === 0
		? 'No tasks'
		: `${project.counts.percent}% ` +
				`(${project.counts.completed}/${project.counts.total})`;
}

function addProjectLink(
	containerEl: HTMLElement,
	project: GoalProjectItem,
	open: OpenProject,
): void {
	const link = containerEl.createEl('a', {
		cls: 'internal-link questline-project-link',
		text: project.name,
	});
	link.setAttr('href', project.path);
	link.addEventListener('click', (event) => {
		open(project.path, event);
	});
}

function renderProjectList(
	containerEl: HTMLElement,
	projects: readonly GoalProjectItem[],
	compact: boolean,
	open: OpenProject,
	timeFormat: TimeFormat,
): void {
	const list = containerEl.createEl('ul', {
		cls: 'questline-project-list',
	});
	if (compact) list.addClass('questline-project-list--compact');

	for (const project of projects) {
		const entry = list.createEl('li', {
			cls: 'questline-project-item',
		});
		addProjectLink(entry, project, open);

		const meta = entry.createSpan({ cls: 'questline-project-meta' });
		meta.createSpan({
			cls: 'questline-project-status',
			text: project.status ?? 'No status',
		});
		meta.createSpan({
			cls: 'questline-project-progress',
			text: projectProgressText(project),
		});
		if (project.hours !== null) {
			meta.createSpan({
				cls: 'questline-project-time',
				text: formatTrackedHours(project.hours, timeFormat),
			});
		}
	}
}

function renderProjectTable(
	containerEl: HTMLElement,
	projects: readonly GoalProjectItem[],
	showHours: boolean,
	timeFormat: TimeFormat,
	open: OpenProject,
): void {
	const table = containerEl.createEl('table', {
		cls: 'questline-project-table',
	});
	const head = table.createEl('thead').createEl('tr');
	const headers = ['Project', 'Status', 'Progress'];
	if (showHours) headers.push('Hours');

	for (const label of headers) {
		head.createEl('th', { text: label });
	}

	const body = table.createEl('tbody');

	for (const project of projects) {
		const row = body.createEl('tr');
		const name = row.createEl('td');
		addProjectLink(name, project, open);
		row.createEl('td', { text: project.status ?? 'No status' });
		row.createEl('td', {
			cls: 'questline-project-progress',
			text: projectProgressText(project),
		});
		if (showHours) {
			row.createEl('td', {
				cls: 'questline-project-hours',
				text: formatTrackedHours(project.hours ?? 0, timeFormat),
			});
		}
	}
}

function renderProjectCards(
	containerEl: HTMLElement,
	projects: readonly GoalProjectItem[],
	barStyle: ProgressBarStyle,
	timeFormat: TimeFormat,
	open: OpenProject,
): void {
	const grid = containerEl.createDiv({ cls: 'questline-project-cards' });

	for (const project of projects) {
		const card = grid.createDiv({ cls: 'questline-project-card' });
		const header = card.createDiv({ cls: 'questline-project-card-header' });
		addProjectLink(header, project, open);
		header.createSpan({
			cls: 'questline-project-status',
			text: project.status ?? 'No status',
		});

		if (project.counts.total === 0) {
			card.createDiv({
				cls: 'questline-empty questline-project-progress',
				text: 'No tasks',
			});
			if (project.hours !== null) {
				card.createDiv({
					cls: 'questline-project-time',
					text: formatTrackedHours(project.hours, timeFormat),
				});
			}
			continue;
		}

		renderProgressRow(
			card,
			project.counts.percent,
			`Project progress: ${project.name}`,
			barStyle,
		);
		card.createDiv({
			cls: 'questline-project-counts',
			text: `${project.counts.completed} / ${project.counts.total} tasks`,
		});
		if (project.hours !== null) {
			card.createDiv({
				cls: 'questline-project-time',
				text: formatTrackedHours(project.hours, timeFormat),
			});
		}
	}
}

interface GoalProjectsState {
	search: string;
	status: string;
	author: string;
	sort: ProjectSort;
	direction: ProjectDirection;
}

const DEFAULT_GOAL_PROJECTS_STATE: GoalProjectsState = {
	search: '',
	status: '',
	author: '',
	sort: DEFAULT_PROJECT_SORT,
	direction: DEFAULT_PROJECT_DIRECTION,
};

interface ProjectOption {
	value: string;
	label: string;
}

const STATUS_EMOJI: Record<string, string> = {
	todo: '📋',
	waiting: '⏳',
	'in progress': '🔄',
	completed: '✅',
	discarded: '🚫',
	'on hold': '⏸️',
};

function statusEmoji(status: string | null): string {
	return status ? (STATUS_EMOJI[status.toLowerCase()] ?? '⚪') : '⚪';
}

function statusLabel(status: string | null): string {
	return status ?? 'No status';
}

/** Five filled/empty blocks, matching the original project dashboard. */
function blockBar(percent: number): string {
	const filled = Math.round(
		(Math.max(0, Math.min(100, percent)) / 100) * 5,
	);

	return '█'.repeat(filled) + '░'.repeat(5 - filled);
}

function statusOptions(
	items: readonly GoalProjectItem[],
	statuses: readonly string[],
): ProjectOption[] {
	const seen = new Map<string, string>();

	for (const status of statuses) {
		const key = status.toLowerCase();
		if (!seen.has(key)) seen.set(key, status);
	}

	for (const item of items) {
		if (!item.status) continue;

		const key = item.status.toLowerCase();
		if (!seen.has(key)) seen.set(key, item.status);
	}

	const options = [...seen.values()].map((status) => ({
		value: status,
		label: status,
	}));

	if (items.some((item) => item.status === null)) {
		options.push({ value: NO_STATUS_FILTER, label: 'No status' });
	}

	return options;
}

function authorOptions(items: readonly GoalProjectItem[]): ProjectOption[] {
	const seen = new Map<string, string>();

	for (const item of items) {
		for (const author of item.authors) {
			const key = author.toLowerCase();
			if (!seen.has(key)) seen.set(key, author);
		}
	}

	const options = [...seen.values()]
		.sort(compareText)
		.map((author) => ({ value: author, label: author }));

	if (items.some((item) => item.authors.length === 0)) {
		options.push({ value: 'None', label: 'None' });
	}

	return options;
}

function renderProjectStats(
	containerEl: HTMLElement,
	items: readonly GoalProjectItem[],
	config: QuestlineConfig,
	timeFormat: TimeFormat,
): void {
	const row = containerEl.createDiv({ cls: 'questline-project-stats' });

	for (const stat of dashboardStats(items, config.useTimekeep, timeFormat)) {
		const cell = row.createDiv({ cls: 'questline-project-stat' });
		cell.createDiv({
			cls: 'questline-project-stat-label',
			text: stat.label,
		});
		cell.createDiv({
			cls: 'questline-project-stat-value',
			text: stat.value,
		});
	}
}

function renderProjectDashboard(
	containerEl: HTMLElement,
	projects: readonly GoalProjectItem[],
	config: QuestlineConfig,
	timeFormat: TimeFormat,
	open: OpenProject,
): void {
	const wrap = containerEl.createDiv({ cls: 'questline-project-table-wrap' });
	const table = wrap.createEl('table', {
		cls: 'questline-project-table questline-project-table--dashboard',
	});
	const head = table.createEl('thead').createEl('tr');
	const headers = ['Project', 'Author', 'Status', 'Progress', 'Tasks'];
	if (config.useTimekeep) headers.push('Hours');

	for (const header of headers) head.createEl('th', { text: header });

	const body = table.createEl('tbody');

	for (const project of projects) {
		const row = body.createEl('tr');
		const name = row.createEl('td');
		addProjectLink(name, project, open);
		row.createEl('td', {
			cls: 'questline-project-author',
			text: projectAuthor(project),
		});
		row.createEl('td', {
			text: `${statusEmoji(project.status)} ${statusLabel(project.status)}`,
		});

		const progress = row.createEl('td', {
			cls: 'questline-project-progress',
		});
		progress.createSpan({
			cls: 'questline-project-blocks',
			text: blockBar(project.counts.percent),
		});
		progress.createSpan({
			cls: 'questline-project-percent',
			text: `${project.counts.percent}%`,
		});
		row.createEl('td', {
			cls: 'questline-project-tasks',
			text: `${project.counts.completed}/${project.counts.total}`,
		});

		if (config.useTimekeep) {
			row.createEl('td', {
				cls: 'questline-project-hours',
				text: formatTrackedHours(project.hours ?? 0, timeFormat),
			});
		}
	}
}

class GoalProjectsBlock extends QuestlineBlock {
	private readonly state: GoalProjectsState = {
		...DEFAULT_GOAL_PROJECTS_STATE,
	};

	protected paintBlock(containerEl: HTMLElement): void {
		const index = this.plugin.getIndex();
		const goal = index.goalByPath.get(this.sourcePath);

		if (!goal) {
			renderEmpty(containerEl, NOT_A_GOAL);

			return;
		}

		const config = this.plugin.getConfig();
		const projects = goalProjectsView(index, goal, config, new Date());

		if (projects.length === 0) {
			renderEmpty(containerEl, NO_GOAL_PROJECTS);

			return;
		}

		let body: HTMLElement | null = null;
		const refresh = (): void => {
			if (body) this.renderBody(body, projects, config);
		};

		this.renderToolbar(containerEl, projects, config, refresh);
		body = containerEl.createDiv({ cls: 'questline-goal-projects-body' });
		refresh();
	}

	private renderToolbar(
		containerEl: HTMLElement,
		projects: readonly GoalProjectItem[],
		config: QuestlineConfig,
		refresh: () => void,
	): void {
		const controls = containerEl.createDiv({
			cls: 'questline-projects-controls',
		});

		const search = controls.createEl('input', {
			cls: 'questline-projects-search',
			attr: { type: 'text', placeholder: 'Search projects' },
		});
		search.value = this.state.search;
		search.addEventListener('input', () => {
			this.state.search = search.value;
			refresh();
		});

		const status = controls.createEl('select', {
			cls: 'questline-projects-select',
			attr: { 'aria-label': 'Filter by status' },
		});
		status.createEl('option', {
			text: 'All statuses',
			attr: { value: '' },
		});
		const statuses = statusOptions(projects, config.projectStatuses);
		for (const option of statuses) {
			status.createEl('option', {
				text: option.label,
				attr: { value: option.value },
			});
		}
		if (!['', ...statuses.map((option) => option.value)].includes(
			this.state.status,
		)) {
			this.state.status = '';
		}
		status.value = this.state.status;
		status.addEventListener('change', () => {
			this.state.status = status.value;
			refresh();
		});

		const author = controls.createEl('select', {
			cls: 'questline-projects-select',
			attr: { 'aria-label': 'Filter by author' },
		});
		author.createEl('option', {
			text: 'All authors',
			attr: { value: '' },
		});
		const authors = authorOptions(projects);
		for (const option of authors) {
			author.createEl('option', {
				text: option.label,
				attr: { value: option.value },
			});
		}
		if (!['', ...authors.map((option) => option.value)].includes(
			this.state.author,
		)) {
			this.state.author = '';
		}
		author.value = this.state.author;
		author.addEventListener('change', () => {
			this.state.author = author.value;
			refresh();
		});

		const sort = controls.createEl('select', {
			cls: 'questline-projects-select',
			attr: { 'aria-label': 'Sort projects' },
		});
		for (const option of PROJECT_SORT_OPTIONS) {
			sort.createEl('option', {
				text: option.label,
				attr: { value: option.value },
			});
		}
		sort.value = this.state.sort;
		sort.addEventListener('change', () => {
			const next = PROJECT_SORT_OPTIONS.find(
				(option) => option.value === sort.value,
			);
			this.state.sort = next?.value ?? DEFAULT_PROJECT_SORT;
			refresh();
		});

		const direction = controls.createEl('button', {
			cls: 'questline-projects-button',
			text: this.state.direction === 'asc' ? '↑' : '↓',
			attr: {
				type: 'button',
				title:
					this.state.direction === 'asc'
						? 'Ascending'
						: 'Descending',
			},
		});
		direction.addEventListener('click', () => {
			this.state.direction =
				this.state.direction === 'asc' ? 'desc' : 'asc';
			const ascending = this.state.direction === 'asc';
			direction.setText(ascending ? '↑' : '↓');
			direction.setAttr('title', ascending ? 'Ascending' : 'Descending');
			refresh();
		});

		const clear = controls.createEl('button', {
			cls: 'questline-projects-button',
			text: 'Clear',
			attr: { type: 'button' },
		});
		clear.addEventListener('click', () => {
			this.state.search = '';
			this.state.status = '';
			this.state.author = '';
			this.state.sort = DEFAULT_PROJECT_SORT;
			this.state.direction = DEFAULT_PROJECT_DIRECTION;
			search.value = '';
			status.value = '';
			author.value = '';
			sort.value = DEFAULT_PROJECT_SORT;
			direction.setText('↑');
			direction.setAttr('title', 'Ascending');
			refresh();
		});
	}

	private renderBody(
		containerEl: HTMLElement,
		projects: readonly GoalProjectItem[],
		config: QuestlineConfig,
	): void {
		containerEl.empty();

		const filtered = filterGoalProjects(projects, {
			search: this.state.search,
			status: this.state.status,
			author: this.state.author,
		});
		const visible = sortGoalProjects(
			filtered,
			this.state.sort,
			this.state.direction,
			config.projectStatuses,
		);
		const open: OpenProject = (path, event) => {
			revealOrOpen(this.plugin.app, path, event, this.sourcePath);
		};

		if (config.goalProjectsStyle === 'dashboard') {
			renderProjectStats(
				containerEl,
				projects,
				config,
				config.trackedTimeFormat,
			);

			if (visible.length === 0) {
				renderEmpty(containerEl, NO_PROJECT_MATCHES);

				return;
			}

			renderProjectDashboard(
				containerEl,
				visible,
				config,
				config.trackedTimeFormat,
				open,
			);

			return;
		}

		if (visible.length === 0) {
			renderEmpty(containerEl, NO_PROJECT_MATCHES);

			return;
		}

		switch (config.goalProjectsStyle) {
			case 'compact':
				renderProjectList(
					containerEl,
					visible,
					true,
					open,
					config.trackedTimeFormat,
				);
				return;
			case 'table':
				renderProjectTable(
					containerEl,
					visible,
					config.useTimekeep,
					config.trackedTimeFormat,
					open,
				);
				return;
			case 'cards':
				renderProjectCards(
					containerEl,
					visible,
					config.progressBarStyle,
					config.trackedTimeFormat,
					open,
				);
				return;
			default:
				renderProjectList(
					containerEl,
					visible,
					false,
					open,
					config.trackedTimeFormat,
				);
		}
	}
}

export function registerProgressBlocks(plugin: QuestlinePlugin): void {
	plugin.registerMarkdownCodeBlockProcessor(
		'goal-progress',
		(_source, el, ctx) => {
			ctx.addChild(new GoalProgressBlock(el, plugin, ctx.sourcePath));
		},
	);
	plugin.registerMarkdownCodeBlockProcessor(
		'project-progress',
		(_source, el, ctx) => {
			ctx.addChild(new ProjectProgressBlock(el, plugin, ctx.sourcePath));
		},
	);
	plugin.registerMarkdownCodeBlockProcessor(
		'goal-projects',
		(_source, el, ctx) => {
			ctx.addChild(new GoalProjectsBlock(el, plugin, ctx.sourcePath));
		},
	);
}
