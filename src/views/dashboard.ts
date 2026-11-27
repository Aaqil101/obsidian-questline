/** The workspace dashboard: minimal tables, cards, and a due-date timeline. */
import {
	ItemView,
	Notice,
	TFile,
	setIcon,
	type WorkspaceLeaf,
} from 'obsidian';
import { openGoalModal, openProjectModal } from '../creation/commands';
import type QuestlinePlugin from '../main';
import type { QuestlineConfig } from '../settings/types';
import {
	applyBoardMove,
	boardColumns,
	boardMoveOptions,
	boardMovePatch,
	renderBoard,
	type BoardKind,
} from './board';
import {
	DEFAULT_GOAL_DIRECTION,
	DEFAULT_GOAL_SORT,
	GOAL_SORT_OPTIONS,
	filterGoals,
	goalCategoryOptions,
	sortGoals,
	type GoalListState,
} from './goal-list';
import { describeDue, type ProjectGoalLink } from './model';
import { revealOrOpen } from './open';
import {
	activeGoals,
	dashboardData,
	dueUrgency,
	goalOverviewItems,
	groupGoalsByCategory,
	inProgressProjects,
	projectOverviewItems,
	timelineBuckets,
	type AttentionItem,
	type DashboardData,
	type DueUrgency,
	type GoalOverviewItem,
	type OverviewStat,
	type ProjectOverviewItem,
} from './overview';
import {
	DEFAULT_PROJECT_LIST_STATE,
	PROJECT_SORT_OPTIONS,
	authorOptions,
	filterGoalProjects,
	formatTrackedHours,
	projectAuthor,
	sortGoalProjects,
	statusOptions,
	type ProjectListState,
} from './projects';
import { countLabel, renderEmpty, renderProgressRow } from './render';

export const DASHBOARD_VIEW_TYPE = 'questline-dashboard';

const STAT_ICONS: Record<string, string> = {
	Goals: 'target',
	Projects: 'folder',
	'In progress': 'loader',
	Completed: 'check',
	'Avg progress': 'trending-up',
	'Tracked time': 'clock',
};

const CATEGORY_COLORS = 8;

interface BoardCardState {
	kind: BoardKind;
	path: string;
	lane: string | null;
	name: string;
}

function slug(text: string): string {
	const value = text
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return value || 'none';
}

function statClass(label: string): string {
	return `questline-dashboard-stat--${slug(label)}`;
}

function categoryClass(category: string | null): string {
	if (!category) return 'questline-dashboard-cat-none';

	let hash = 0;
	for (const char of category.toLowerCase()) {
		hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
	}

	return `questline-dashboard-cat-${hash % CATEGORY_COLORS}`;
}

function statusClass(status: string | null): string {
	return `questline-dashboard-status--${slug(status ?? 'none')}`;
}

function dueBadge(
	goal: GoalOverviewItem,
): { text: string; urgency: DueUrgency } | null {
	const urgency = dueUrgency(goal.due);
	if (urgency === 'none') return null;

	const remaining = goal.due?.remainingDays ?? 0;
	const text =
		urgency === 'overdue'
			? `${Math.abs(remaining)}d overdue`
			: urgency === 'today'
				? 'Due today'
				: urgency === 'soon'
					? `${remaining}d left`
					: (goal.due?.dueDate ?? '');

	return text ? { text, urgency } : null;
}

function summarise(data: DashboardData): string {
	const goals = activeGoals(data.goals).length;
	const attention = data.attention.length;
	const parts = [
		countLabel(goals, 'active goal', 'active goals'),
		countLabel(data.projects.length, 'project', 'projects'),
	];

	if (attention === 0) {
		parts.push('all clear');
	} else {
		parts.push(
			attention === 1 ? '1 needs attention' : `${attention} need attention`,
		);
	}

	return parts.join(' · ');
}

const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
];

function dueDateParts(goal: GoalOverviewItem): {
	month: string;
	day: string;
	relative: string;
} {
	const due = goal.due;
	if (!due || due.infinite || !due.dueDate) {
		return { month: '—', day: '—', relative: 'No date' };
	}

	const [, month, day] = due.dueDate.split('-');
	const remaining = due.remainingDays;
	const relative =
		remaining === null
			? 'Due'
			: remaining < 0
				? `${Math.abs(remaining)}d late`
				: remaining === 0
					? 'Today'
					: `${remaining}d`;

	return {
		month: MONTHS[Number(month) - 1] ?? month ?? '—',
		day: day ?? '—',
		relative,
	};
}

function timelineSummary(data: DashboardData): string {
	const active = activeGoals(data.goals).length;
	const inProgress = inProgressProjects(data.projects).length;
	const tracked = data.stats.find(
		(stat) => stat.label === 'Tracked time',
	)?.value;
	const parts = [
		countLabel(active, 'active goal', 'active goals'),
		countLabel(inProgress, 'project in progress', 'projects in progress'),
	];
	if (tracked) parts.push(`${tracked} tracked`);

	return parts.join(' · ');
}

function addMetaItem(
	containerEl: HTMLElement,
	icon: string,
	text: string,
): void {
	const item = containerEl.createSpan({
		cls: 'questline-dashboard-meta-item',
	});
	const iconEl = item.createSpan({ cls: 'questline-dashboard-meta-icon' });
	setIcon(iconEl, icon);
	item.createSpan({ text });
}

function renderStatCards(
	containerEl: HTMLElement,
	stats: readonly OverviewStat[],
): void {
	const row = containerEl.createDiv({ cls: 'questline-dashboard-stats' });

	for (const stat of stats) {
		const card = row.createDiv({
			cls: `questline-dashboard-stat ${statClass(stat.label)}`,
		});
		const icon = card.createDiv({
			cls: 'questline-dashboard-stat-icon',
		});
		setIcon(icon, STAT_ICONS[stat.label] ?? 'activity');
		card.createDiv({
			cls: 'questline-dashboard-stat-value',
			text: stat.value,
		});
		card.createDiv({
			cls: 'questline-dashboard-stat-label',
			text: stat.label,
		});
	}
}

export class QuestlineDashboardView extends ItemView {
	private unsubscribe: (() => void) | null = null;
	private activeTab: 'dashboard' | 'goals' | 'projects' = 'dashboard';
	private goalList: GoalListState = {
		search: '',
		category: '',
		showArchived: false,
		sort: DEFAULT_GOAL_SORT,
		direction: DEFAULT_GOAL_DIRECTION,
	};
	private projectList: ProjectListState = {
		...DEFAULT_PROJECT_LIST_STATE,
	};
	private boardDrag: BoardCardState | null = null;
	private boardWritePending = false;
	private boardDragEndedAt = 0;
	private boardMenu: {
		menu: HTMLElement;
		trigger: HTMLElement;
		cleanup: () => void;
	} | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: QuestlinePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Questline';
	}

	getIcon(): string {
		return 'target';
	}

	/** True when the active tab paints a board. */
	hasBoard(): boolean {
		const config = this.plugin.getConfig();

		return (
			(this.activeTab === 'goals' && config.goalsStyle === 'board') ||
			(this.activeTab === 'projects' &&
				config.projectsStyle === 'board')
		);
	}

	/** Focus the board's active card, or its first card. */
	focusBoard(): void {
		const card =
			this.contentEl.querySelector<HTMLElement>(
				'.questline-board-card[tabindex="0"]',
			) ??
			this.contentEl.querySelector<HTMLElement>(
				'.questline-board-card',
			);
		card?.focus();
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('questline-dashboard');
		this.unsubscribe = this.plugin.onIndexRefresh(() => this.render());
		this.render();
	}

	async onClose(): Promise<void> {
		this.closeBoardMoveMenu(false);
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private render(): void {
		const { contentEl } = this;
		this.closeBoardMoveMenu(false);
		contentEl.empty();
		this.boardDrag = null;

		const config = this.plugin.getConfig();
		if (this.hasBoard() && config.skipControlsToBoard) {
			this.renderBoardFocusTarget(contentEl);
		}
		this.renderTabs(contentEl);

		if (this.activeTab === 'goals') {
			const goals = goalOverviewItems(
				this.plugin.getIndex(),
				config,
				new Date(),
			);
			this.renderGoalsTab(contentEl, goals, config);
			return;
		}

		if (this.activeTab === 'projects') {
			const projects = projectOverviewItems(
				this.plugin.getIndex(),
				config,
				new Date(),
			);
			this.renderProjectsTab(contentEl, projects, config);
			return;
		}

		const data = dashboardData(
			this.plugin.getIndex(),
			config,
			new Date(),
		);

		switch (config.dashboardStyle) {
			case 'cards':
				this.renderCards(contentEl, data, config);
				return;
			case 'timeline':
				this.renderTimeline(contentEl, data, config);
				return;
			default:
				this.renderMinimal(contentEl, data, config);
		}
	}

	private renderBoardFocusTarget(containerEl: HTMLElement): void {
		const target = containerEl.createSpan({
			cls: 'questline-board-skip-target',
			attr: { tabindex: '0', 'aria-label': 'Board' },
		});
		target.addEventListener('focus', () => {
			if (!this.hasBoard()) return;

			this.focusBoard();
		});
		queueMicrotask(() => {
			if (
				target.isConnected &&
				!this.contentEl.querySelector('.questline-board-card')
			) {
				target.remove();
			}
		});
	}

	private renderTabs(containerEl: HTMLElement): void {
		const tabs = containerEl.createDiv({
			cls: 'questline-tabs',
			attr: { role: 'tablist' },
		});

		const options: readonly {
			id: 'dashboard' | 'goals' | 'projects';
			label: string;
		}[] = [
			{ id: 'dashboard', label: 'Dashboard' },
			{ id: 'goals', label: 'Goals' },
			{ id: 'projects', label: 'Projects' },
		];

		for (const tab of options) {
			const active = this.activeTab === tab.id;
			const button = tabs.createEl('button', {
				cls: `questline-tab${active ? ' is-active' : ''}`,
				text: tab.label,
				attr: {
					type: 'button',
					role: 'tab',
					'aria-selected': active ? 'true' : 'false',
				},
			});
			button.addEventListener('click', () => {
				if (this.activeTab === tab.id) return;
				this.activeTab = tab.id;
				this.render();
			});
		}
	}

	private renderGoalsTab(
		containerEl: HTMLElement,
		goals: readonly GoalOverviewItem[],
		config: QuestlineConfig,
	): void {
		const header = containerEl.createDiv({
			cls: 'questline-dashboard-header-bar',
		});
		const text = header.createDiv({
			cls: 'questline-goals-header-text',
		});
		text.createEl('h2', {
			cls: 'questline-dashboard-title',
			text: 'Goals',
		});
		text.createEl('p', {
			cls: 'questline-goals-summary',
			text: countLabel(goals.length, 'goal', 'goals'),
		});

		const actions = header.createDiv({
			cls: 'questline-dashboard-actions',
		});
		this.addActionButton(
			actions,
			'New goal',
			null,
			() => {
				openGoalModal(this.plugin);
			},
			true,
		);
		this.addActionButton(actions, 'New project', null, () => {
			openProjectModal(this.plugin);
		});

		const controls = containerEl.createDiv({
			cls: 'questline-projects-controls questline-goals-controls',
		});

		const search = controls.createEl('input', {
			cls: 'questline-projects-search',
			attr: { type: 'search', placeholder: 'Search goals' },
		});
		search.value = this.goalList.search;

		const category = controls.createEl('select', {
			cls: 'questline-projects-select',
			attr: { 'aria-label': 'Filter by category' },
		});
		category.createEl('option', {
			text: 'All categories',
			attr: { value: '' },
		});
		const categories = goalCategoryOptions(goals, config.goalCategories);
		for (const option of categories) {
			category.createEl('option', {
				text: option.label,
				attr: { value: option.value },
			});
		}
		if (
			!['', ...categories.map((option) => option.value)].includes(
				this.goalList.category,
			)
		) {
			this.goalList.category = '';
		}
		category.value = this.goalList.category;

		const archived = controls.createEl('label', {
			cls: 'questline-goals-archived',
		});
		const archivedInput = archived.createEl('input', {
			attr: { type: 'checkbox' },
		});
		archivedInput.checked = this.goalList.showArchived;
		archived.createSpan({ text: 'Show archived' });

		let sort: HTMLSelectElement | null = null;
		let direction: HTMLButtonElement | null = null;

		if (config.goalsStyle !== 'board') {
			sort = controls.createEl('select', {
				cls: 'questline-projects-select',
				attr: { 'aria-label': 'Sort goals' },
			});
			for (const option of GOAL_SORT_OPTIONS) {
				sort.createEl('option', {
					text: option.label,
					attr: { value: option.value },
				});
			}
			sort.value = this.goalList.sort;

			direction = controls.createEl('button', {
				cls: 'questline-projects-button',
				text: this.goalList.direction === 'asc' ? '↑' : '↓',
				attr: {
					type: 'button',
					title:
						this.goalList.direction === 'asc'
							? 'Ascending'
							: 'Descending',
				},
			});
		}

		const clear = controls.createEl('button', {
			cls: 'questline-projects-button',
			text: 'Clear',
			attr: { type: 'button' },
		});

		const body = containerEl.createDiv({
			cls: 'questline-goals-body',
		});
		const refresh = (): void => {
			this.renderGoalsBody(body, goals, config);
		};

		search.addEventListener('input', () => {
			this.goalList.search = search.value;
			refresh();
		});
		category.addEventListener('change', () => {
			this.goalList.category = category.value;
			refresh();
		});
		archivedInput.addEventListener('change', () => {
			this.goalList.showArchived = archivedInput.checked;
			refresh();
		});
		if (sort) {
			sort.addEventListener('change', () => {
				const next = GOAL_SORT_OPTIONS.find(
					(option) => option.value === sort?.value,
				);
				this.goalList.sort = next?.value ?? DEFAULT_GOAL_SORT;
				refresh();
			});
		}
		if (direction) {
			direction.addEventListener('click', () => {
				this.goalList.direction =
					this.goalList.direction === 'asc' ? 'desc' : 'asc';
				const ascending = this.goalList.direction === 'asc';
				direction?.setText(ascending ? '↑' : '↓');
				direction?.setAttr(
					'title',
					ascending ? 'Ascending' : 'Descending',
				);
				refresh();
			});
		}
		clear.addEventListener('click', () => {
			this.goalList.search = '';
			this.goalList.category = '';
			this.goalList.showArchived = false;
			this.goalList.sort = DEFAULT_GOAL_SORT;
			this.goalList.direction = DEFAULT_GOAL_DIRECTION;
			search.value = '';
			category.value = '';
			archivedInput.checked = false;
			if (sort) sort.value = DEFAULT_GOAL_SORT;
			if (direction) {
				direction.setText('↑');
				direction.setAttr('title', 'Ascending');
			}
			refresh();
		});

		refresh();
	}

	private renderGoalsBody(
		containerEl: HTMLElement,
		goals: readonly GoalOverviewItem[],
		config: QuestlineConfig,
	): void {
		containerEl.empty();

		const filtered = filterGoals(goals, this.goalList);
		const visible = sortGoals(
			filtered,
			this.goalList.sort,
			this.goalList.direction,
			config.goalCategories,
		);

		if (goals.length === 0) {
			renderEmpty(
				containerEl,
				'No goals yet. Create a goal to get started.',
			);

			return;
		}

		containerEl.createDiv({
			cls: 'questline-goals-count',
			text:
				visible.length === goals.length
					? countLabel(visible.length, 'goal', 'goals')
					: `${visible.length} of ${countLabel(
							goals.length,
							'goal',
							'goals',
						)}`,
		});

		if (visible.length === 0) {
			renderEmpty(containerEl, 'No goals match these filters.');

			return;
		}

		if (config.goalsStyle === 'board') {
			this.renderGoalsBoard(containerEl, visible, config);
			return;
		}

		if (config.goalsStyle === 'cards') {
			this.renderGoalsCards(containerEl, visible, config);
			return;
		}

		const table = containerEl.createDiv({
			cls: 'questline-goals-table',
		});
		const header = table.createDiv({
			cls: 'questline-goals-row questline-goals-row--header',
		});
		for (const label of [
			'Goal',
			'Category',
			'Progress',
			'Tasks',
			'Projects',
			'Due',
		]) {
			header.createSpan({
				cls: 'questline-goals-cell',
				text: label,
			});
		}

		for (const goal of visible) {
			const row = this.noteLink(
				table,
				goal.path,
				`Open goal ${goal.name}`,
				`questline-goals-row${goal.archived ? ' is-archived' : ''}`,
			);

			const title = row.createDiv({
				cls: 'questline-goals-cell questline-goals-cell--title',
				attr: { 'data-label': 'Goal' },
			});
			title.createSpan({
				cls: 'questline-goals-title',
				text: goal.name,
			});
			if (goal.archived) {
				title.createSpan({
					cls: 'questline-goals-archived-badge',
					text: 'Archived',
				});
			}

			row.createDiv({
				cls: 'questline-goals-cell questline-goals-cell--category',
				attr: { 'data-label': 'Category' },
				text: goal.category ?? 'No category',
			});

			const progress = row.createDiv({
				cls: 'questline-goals-cell questline-goals-cell--progress',
				attr: { 'data-label': 'Progress' },
			});
			renderProgressRow(
				progress,
				goal.counts.percent,
				`Goal progress: ${goal.name}`,
				config.progressBarStyle,
			);

			row.createDiv({
				cls: 'questline-goals-cell questline-goals-cell--number',
				attr: { 'data-label': 'Tasks' },
				text: `${goal.counts.completed} / ${goal.counts.total}`,
			});
			row.createDiv({
				cls: 'questline-goals-cell questline-goals-cell--number',
				attr: { 'data-label': 'Projects' },
				text: String(goal.projectCount),
			});

			row.createDiv({
				cls:
					'questline-goals-cell questline-goals-cell--due' +
					(goal.due?.overdue ? ' is-overdue' : ''),
				attr: { 'data-label': 'Due' },
				text: describeDue(goal.due),
			});
		}
	}

	private renderGoalsCards(
		containerEl: HTMLElement,
		goals: readonly GoalOverviewItem[],
		config: QuestlineConfig,
	): void {
		const wrap = containerEl.createDiv({
			cls: 'questline-goals-cards',
		});

		if (this.goalList.sort === 'category') {
			this.renderGoalCategoryGroups(wrap, goals, config);
			return;
		}

		const grid = wrap.createDiv({
			cls: 'questline-dashboard-cards',
		});
		for (const goal of goals) {
			this.renderGoalCard(grid, goal, config, true);
		}
	}

	private renderProjectsTab(
		containerEl: HTMLElement,
		projects: readonly ProjectOverviewItem[],
		config: QuestlineConfig,
	): void {
		const header = containerEl.createDiv({
			cls: 'questline-dashboard-header-bar',
		});
		const text = header.createDiv({
			cls: 'questline-projects-header-text',
		});
		text.createEl('h2', {
			cls: 'questline-dashboard-title',
			text: 'Projects',
		});
		text.createEl('p', {
			cls: 'questline-projects-summary',
			text: countLabel(projects.length, 'project', 'projects'),
		});

		const actions = header.createDiv({
			cls: 'questline-dashboard-actions',
		});
		this.addActionButton(
			actions,
			'New goal',
			null,
			() => {
				openGoalModal(this.plugin);
			},
			true,
		);
		this.addActionButton(actions, 'New project', null, () => {
			openProjectModal(this.plugin);
		});

		const controls = containerEl.createDiv({
			cls: 'questline-projects-controls',
		});

		const search = controls.createEl('input', {
			cls: 'questline-projects-search',
			attr: { type: 'search', placeholder: 'Search projects' },
		});
		search.value = this.projectList.search;

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
		if (
			!['', ...statuses.map((option) => option.value)].includes(
				this.projectList.status,
			)
		) {
			this.projectList.status = '';
		}
		status.value = this.projectList.status;

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
		if (
			!['', ...authors.map((option) => option.value)].includes(
				this.projectList.author,
			)
		) {
			this.projectList.author = '';
		}
		author.value = this.projectList.author;

		let sort: HTMLSelectElement | null = null;
		let direction: HTMLButtonElement | null = null;

		if (config.projectsStyle !== 'board') {
			sort = controls.createEl('select', {
				cls: 'questline-projects-select',
				attr: { 'aria-label': 'Sort projects' },
			});
			for (const option of PROJECT_SORT_OPTIONS) {
				sort.createEl('option', {
					text: option.label,
					attr: { value: option.value },
				});
			}
			sort.value = this.projectList.sort;

			direction = controls.createEl('button', {
				cls: 'questline-projects-button',
				text: this.projectList.direction === 'asc' ? '↑' : '↓',
				attr: {
					type: 'button',
					title:
						this.projectList.direction === 'asc'
							? 'Ascending'
							: 'Descending',
				},
			});
		}

		const clear = controls.createEl('button', {
			cls: 'questline-projects-button',
			text: 'Clear',
			attr: { type: 'button' },
		});

		const body = containerEl.createDiv({
			cls: 'questline-projects-body',
		});
		const refresh = (): void => {
			this.renderProjectsBody(body, projects, config);
		};

		search.addEventListener('input', () => {
			this.projectList.search = search.value;
			refresh();
		});
		status.addEventListener('change', () => {
			this.projectList.status = status.value;
			refresh();
		});
		author.addEventListener('change', () => {
			this.projectList.author = author.value;
			refresh();
		});
		if (sort) {
			sort.addEventListener('change', () => {
				const next = PROJECT_SORT_OPTIONS.find(
					(option) => option.value === sort?.value,
				);
				this.projectList.sort =
					next?.value ?? DEFAULT_PROJECT_LIST_STATE.sort;
				refresh();
			});
		}
		if (direction) {
			direction.addEventListener('click', () => {
				this.projectList.direction =
					this.projectList.direction === 'asc' ? 'desc' : 'asc';
				const ascending = this.projectList.direction === 'asc';
				direction?.setText(ascending ? '↑' : '↓');
				direction?.setAttr(
					'title',
					ascending ? 'Ascending' : 'Descending',
				);
				refresh();
			});
		}
		clear.addEventListener('click', () => {
			this.projectList.search = DEFAULT_PROJECT_LIST_STATE.search;
			this.projectList.status = DEFAULT_PROJECT_LIST_STATE.status;
			this.projectList.author = DEFAULT_PROJECT_LIST_STATE.author;
			this.projectList.sort = DEFAULT_PROJECT_LIST_STATE.sort;
			this.projectList.direction = DEFAULT_PROJECT_LIST_STATE.direction;
			search.value = this.projectList.search;
			status.value = this.projectList.status;
			author.value = this.projectList.author;
			if (sort) sort.value = this.projectList.sort;
			if (direction) {
				direction.setText('↑');
				direction.setAttr('title', 'Ascending');
			}
			refresh();
		});

		refresh();
	}

	private renderProjectsBody(
		containerEl: HTMLElement,
		projects: readonly ProjectOverviewItem[],
		config: QuestlineConfig,
	): void {
		containerEl.empty();

		const filtered = filterGoalProjects(projects, this.projectList);
		const visible = sortGoalProjects(
			filtered,
			this.projectList.sort,
			this.projectList.direction,
			config.projectStatuses,
		);

		if (projects.length === 0) {
			renderEmpty(
				containerEl,
				'No projects yet. Create a project to get started.',
			);

			return;
		}

		containerEl.createDiv({
			cls: 'questline-projects-count',
			text:
				visible.length === projects.length
					? countLabel(visible.length, 'project', 'projects')
					: `${visible.length} of ${countLabel(
							projects.length,
							'project',
							'projects',
						)}`,
		});

		if (visible.length === 0) {
			renderEmpty(containerEl, 'No projects match these filters.');

			return;
		}

		if (config.projectsStyle === 'board') {
			this.renderProjectsBoard(containerEl, visible, config);
			return;
		}

		if (config.projectsStyle === 'cards') {
			const grid = containerEl.createDiv({
				cls: 'questline-dashboard-projects questline-projects-view-cards',
			});
			for (const project of visible) {
				this.renderProjectCard(grid, project, config, false);
			}

			return;
		}

		const wrap = containerEl.createDiv({
			cls: 'questline-projects-table-wrap',
		});
		const table = wrap.createEl('table', {
			cls: 'questline-projects-list-table',
		});
		const headers = [
			'Project',
			'Goals',
			'Author',
			'Status',
			'Progress',
			'Tasks',
		];
		if (config.useTimekeep) headers.push('Hours');

		const head = table.createEl('thead').createEl('tr');
		for (const label of headers) head.createEl('th', { text: label });

		const body = table.createEl('tbody');

		for (const project of visible) {
			const row = body.createEl('tr');

			const name = row.createEl('td', {
				cls: 'questline-projects-name',
			});
			this.noteTextLink(
				name,
				project.path,
				project.name,
				`Open project ${project.name}`,
				'questline-projects-link',
			);

			const goal = row.createEl('td', {
				cls: 'questline-projects-goal',
			});
			this.renderGoalLinks(
				goal,
				project.goals,
				'questline-projects-goal-link',
			);

			row.createEl('td', {
				cls: 'questline-projects-author',
				text: projectAuthor(project),
			});
			row.createEl('td', {
				cls: 'questline-projects-status',
				text: project.status ?? 'No status',
			});

			const progress = row.createEl('td', {
				cls: 'questline-projects-progress-cell',
			});
			renderProgressRow(
				progress,
				project.counts.percent,
				`Project progress: ${project.name}`,
				config.progressBarStyle,
			);

			row.createEl('td', {
				cls: 'questline-projects-number',
				text: `${project.counts.completed} / ${project.counts.total}`,
			});

			if (config.useTimekeep) {
				row.createEl('td', {
					cls: 'questline-projects-number',
					text:
						project.hours === null
							? '—'
							: formatTrackedHours(
									project.hours,
									config.trackedTimeFormat,
								),
				});
			}
		}
	}

	private renderGoalsBoard(
		containerEl: HTMLElement,
		goals: readonly GoalOverviewItem[],
		config: QuestlineConfig,
	): void {
		const sorted = sortGoals(
			goals,
			'name',
			'asc',
			config.goalCategories,
		);
		const columns = boardColumns(
			sorted,
			config.goalCategories,
			(goal) => goal.category,
			'No category',
		);

		renderBoard(containerEl, columns, {
			laneClass: (column) => categoryClass(column.value),
			emptyText: 'No goals',
			renderCard: (cards, goal) => {
				this.renderGoalBoardCard(cards, goal, config);
			},
		});

		this.bindBoardDrop(containerEl, 'goal');
		this.setupBoardKeyboard(containerEl);
	}

	private renderGoalBoardCard(
		containerEl: HTMLElement,
		goal: GoalOverviewItem,
		config: QuestlineConfig,
	): void {
		const ref: BoardCardState = {
			kind: 'goal',
			path: goal.path,
			lane: goal.category,
			name: goal.name,
		};
		const card = containerEl.createDiv({
			cls: `questline-goals-board-card questline-board-card${goal.archived ? ' is-archived' : ''}`,
			attr: {
				tabindex: '-1',
				role: 'button',
				'aria-label': `Goal ${goal.name}. Enter opens the note, Space opens Move to.`,
				'data-board-path': goal.path,
			},
		});
		card.addEventListener('click', (event) => {
			if (!this.canOpenBoardCard()) return;

			revealOrOpen(this.plugin.app, goal.path, event);
		});

		const header = card.createDiv({
			cls: 'questline-goals-board-header',
		});
		const top = header.createDiv({
			cls: 'questline-goals-board-top',
		});
		const title = top.createDiv({
			cls: 'questline-goals-board-title',
		});
		const titleLink = this.noteTextLink(
			title,
			goal.path,
			goal.name,
			`Open goal ${goal.name}`,
			'questline-goals-title',
			() => this.canOpenBoardCard(),
		);
		titleLink.addEventListener('click', (event) => {
			event.stopPropagation();
		});
		if (goal.archived) {
			title.createSpan({
				cls: 'questline-goals-archived-badge',
				text: 'Archived',
			});
		}
		this.createBoardMoveButton(top, ref);
		header.createSpan({
			cls: 'questline-goals-board-category',
			text: goal.category ?? 'No category',
		});

		renderProgressRow(
			card,
			goal.counts.percent,
			`Goal progress: ${goal.name}`,
			config.progressBarStyle,
		);

		const meta = card.createDiv({ cls: 'questline-dashboard-meta' });
		addMetaItem(
			meta,
			'list-checks',
			`${goal.counts.completed} / ${goal.counts.total} tasks`,
		);
		addMetaItem(
			meta,
			'folder',
			countLabel(goal.projectCount, 'project', 'projects'),
		);
		addMetaItem(meta, 'calendar', describeDue(goal.due));

		const details: string[] = [];
		if (goal.target !== null) {
			details.push(
				goal.progress === null
					? `Target: ${goal.target}`
					: `Target: ${goal.progress} / ${goal.target}`,
			);
		}
		if (goal.timespan) details.push(`Timespan: ${goal.timespan}`);
		if (details.length > 0) {
			card.createDiv({
				cls: 'questline-goals-board-details',
				text: details.join(' · '),
			});
		}
		if (goal.reason) {
			card.createDiv({
				cls: 'questline-goals-board-reason',
				text: `Reason: ${goal.reason}`,
			});
		}

		this.enableBoardDrag(
			card,
			'goal',
			goal.path,
			goal.category,
			goal.name,
		);
	}

	private renderMinimal(
		containerEl: HTMLElement,
		data: DashboardData,
		config: QuestlineConfig,
	): void {
		this.renderHeaderBar(containerEl);

		if (data.goals.length === 0 && data.projects.length === 0) {
			renderEmpty(
				containerEl,
				'No goals or projects yet. Create a goal to get started.',
			);

			return;
		}

		this.renderStatisticsLine(containerEl, data.stats);
		this.renderCompactAttention(containerEl, data.attention);
		this.renderGoalTable(
			containerEl,
			activeGoals(data.goals),
			data.goals.length === 0,
			config,
		);
		this.renderProjectTable(
			containerEl,
			inProgressProjects(data.projects),
			config,
		);
	}

	private renderCards(
		containerEl: HTMLElement,
		data: DashboardData,
		config: QuestlineConfig,
	): void {
		this.renderHeader(containerEl, data);

		if (data.goals.length === 0 && data.projects.length === 0) {
			renderEmpty(
				containerEl,
				'No goals or projects yet. Create a goal to get started.',
			);

			return;
		}

		renderStatCards(containerEl, data.stats);
		this.renderAttention(containerEl, data.attention);
		this.renderGoals(containerEl, data.goals, config);
		this.renderProjects(
			containerEl,
			inProgressProjects(data.projects),
			config,
		);
	}

	private renderTimeline(
		containerEl: HTMLElement,
		data: DashboardData,
		config: QuestlineConfig,
	): void {
		this.renderTimelineHeader(containerEl, data);

		if (data.goals.length === 0 && data.projects.length === 0) {
			renderEmpty(
				containerEl,
				'No goals or projects yet. Create a goal to get started.',
			);

			return;
		}

		this.renderTimelineAttention(containerEl, data.attention);

		const goals = activeGoals(data.goals);

		if (goals.length === 0) {
			renderEmpty(
				containerEl,
				data.goals.length === 0 ? 'No goals yet.' : 'No active goals.',
			);
		} else {
			const buckets = timelineBuckets(goals);
			const timeline = containerEl.createDiv({
				cls: 'questline-dashboard-timeline',
			});
			const track = timeline.createDiv({
				cls: 'questline-dashboard-timeline-track',
			});
			const axis = track.createDiv({
				cls: 'questline-dashboard-timeline-axis',
			});
			const columns = track.createDiv({
				cls: 'questline-dashboard-timeline-columns',
			});

			for (const bucket of buckets) {
				const bucketClass =
					'questline-dashboard-timeline-column--' + bucket.key;
				const node = axis.createDiv({
					cls: 'questline-dashboard-timeline-node ' + bucketClass,
				});
				node.createSpan({
					cls: 'questline-dashboard-timeline-node-dot',
				});
				const label = node.createDiv({
					cls: 'questline-dashboard-timeline-node-label',
				});
				label.createSpan({
					cls: 'questline-dashboard-timeline-node-title',
					text: bucket.title,
				});
				label.createSpan({
					cls: 'questline-dashboard-count',
					text: String(bucket.goals.length),
				});

				const column = columns.createDiv({
					cls: 'questline-dashboard-timeline-column ' + bucketClass,
				});
				if (bucket.goals.length === 0) {
					column.createDiv({
						cls: 'questline-dashboard-timeline-empty',
						text: 'No goals',
					});
					continue;
				}

				for (const goal of bucket.goals) {
					this.renderTimelineCard(column, goal, config);
				}
			}
		}

		this.renderTimelineProjects(
			containerEl,
			inProgressProjects(data.projects),
			config,
		);
	}

	private renderTimelineHeader(
		containerEl: HTMLElement,
		data: DashboardData,
	): void {
		const header = containerEl.createDiv({
			cls: 'questline-dashboard-timeline-header',
		});
		const text = header.createDiv({
			cls: 'questline-dashboard-timeline-header-text',
		});
		text.createEl('h2', {
			cls: 'questline-dashboard-timeline-title',
			text: 'Timeline',
		});
		text.createEl('p', {
			cls: 'questline-dashboard-timeline-summary',
			text: timelineSummary(data),
		});

		const actions = header.createDiv({
			cls: 'questline-dashboard-actions',
		});
		this.addActionButton(
			actions,
			'New goal',
			null,
			() => {
				openGoalModal(this.plugin);
			},
			true,
		);
		this.addActionButton(actions, 'New project', null, () => {
			openProjectModal(this.plugin);
		});
	}

	private renderTimelineAttention(
		containerEl: HTMLElement,
		items: readonly AttentionItem[],
	): void {
		if (items.length === 0) return;

		const strip = containerEl.createDiv({
			cls: 'questline-dashboard-timeline-attention',
		});
		const icon = strip.createSpan({
			cls: 'questline-dashboard-timeline-attention-icon',
		});
		setIcon(icon, 'alert-triangle');
		strip.createSpan({
			cls: 'questline-dashboard-timeline-attention-label',
			text:
				items.length === 1
					? '1 needs attention'
					: `${items.length} need attention`,
		});

		const list = strip.createDiv({
			cls: 'questline-dashboard-timeline-attention-list',
		});
		for (const item of items) {
			const link = this.noteLink(
				list,
				item.path,
				`Open ${item.name}`,
				'questline-dashboard-timeline-attention-link',
			);
			link.createSpan({ text: item.name });
			link.createSpan({
				cls: 'questline-dashboard-timeline-attention-detail',
				text: ` (${item.detail})`,
			});
		}
	}

	private renderTimelineCard(
		containerEl: HTMLElement,
		goal: GoalOverviewItem,
		config: QuestlineConfig,
	): void {
		const card = this.noteLink(
			containerEl,
			goal.path,
			`Open goal ${goal.name}`,
			'questline-dashboard-timeline-card',
		);
		const date = dueDateParts(goal);
		const dateBox = card.createDiv({
			cls: 'questline-dashboard-timeline-date',
		});
		dateBox.createSpan({
			cls: 'questline-dashboard-timeline-date-month',
			text: date.month,
		});
		dateBox.createSpan({
			cls: 'questline-dashboard-timeline-date-day',
			text: date.day,
		});
		dateBox.createSpan({
			cls: 'questline-dashboard-timeline-date-relative',
			text: date.relative,
		});

		const body = card.createDiv({
			cls: 'questline-dashboard-timeline-card-body',
		});
		body.createSpan({
			cls: 'questline-dashboard-timeline-card-title',
			text: goal.name,
		});
		renderProgressRow(
			body,
			goal.counts.percent,
			`Goal progress: ${goal.name}`,
			config.progressBarStyle,
		);

		const meta = body.createDiv({
			cls: 'questline-dashboard-timeline-meta',
		});
		if (goal.category) {
			meta.createSpan({ text: goal.category });
		}
		meta.createSpan({
			text: `${goal.counts.completed} / ${goal.counts.total} tasks`,
		});
		meta.createSpan({
			text: countLabel(goal.projectCount, 'project', 'projects'),
		});
		if (goal.hours !== null && goal.hours > 0) {
			meta.createSpan({
				text: `${formatTrackedHours(goal.hours, config.trackedTimeFormat)} tracked`,
			});
		}
	}

	private renderTimelineProjects(
		containerEl: HTMLElement,
		projects: readonly ProjectOverviewItem[],
		config: QuestlineConfig,
	): void {
		const section = containerEl.createEl('section', {
			cls: 'questline-dashboard-timeline-projects',
		});
		section.createEl('h3', {
			cls: 'questline-dashboard-timeline-projects-title',
			text: `Projects in progress (${projects.length})`,
		});

		if (projects.length === 0) {
			renderEmpty(section, 'No projects in progress.');

			return;
		}

		const strip = section.createDiv({
			cls: 'questline-dashboard-timeline-project-strip',
		});
		for (const project of projects) {
			const chip = this.noteLink(
				strip,
				project.path,
				`Open project ${project.name}`,
				'questline-dashboard-project-chip ' +
					statusClass(project.status),
			);
			chip.createSpan({
				cls: 'questline-dashboard-project-chip-dot',
			});
			const body = chip.createDiv({
				cls: 'questline-dashboard-project-chip-body',
			});
			body.createSpan({
				cls: 'questline-dashboard-project-chip-name',
				text: project.name,
			});

			const meta = [
				project.status ?? 'No status',
				`${project.counts.percent}%`,
				`${project.counts.completed}/${project.counts.total} tasks`,
			];
			if (project.hours !== null) {
				meta.push(
					formatTrackedHours(
						project.hours,
						config.trackedTimeFormat,
					),
				);
			}
			body.createSpan({
				cls: 'questline-dashboard-project-chip-meta',
				text: meta.join(' · '),
			});
		}
	}
	private renderHeaderBar(containerEl: HTMLElement): void {
		const header = containerEl.createDiv({
			cls: 'questline-dashboard-header-bar',
		});
		header.createEl('h2', {
			cls: 'questline-dashboard-title',
			text: 'Dashboard',
		});

		const actions = header.createDiv({
			cls: 'questline-dashboard-actions',
		});
		this.addActionButton(
			actions,
			'New goal',
			null,
			() => {
				openGoalModal(this.plugin);
			},
			true,
		);
		this.addActionButton(actions, 'New project', null, () => {
			openProjectModal(this.plugin);
		});
	}

	private renderHeader(
		containerEl: HTMLElement,
		data: DashboardData,
	): void {
		const hero = containerEl.createDiv({
			cls: 'questline-dashboard-hero',
		});
		const main = hero.createDiv({
			cls: 'questline-dashboard-hero-main',
		});
		const mark = main.createDiv({
			cls: 'questline-dashboard-hero-mark',
		});
		setIcon(mark, 'layout-dashboard');

		const text = main.createDiv({
			cls: 'questline-dashboard-hero-text',
		});
		text.createEl('h2', {
			cls: 'questline-dashboard-title',
			text: 'Dashboard',
		});
		text.createEl('p', {
			cls: 'questline-dashboard-hero-summary',
			text: summarise(data),
		});

		const actions = hero.createDiv({
			cls: 'questline-dashboard-actions',
		});
		this.addActionButton(
			actions,
			'New goal',
			'target',
			() => {
				openGoalModal(this.plugin);
			},
			true,
		);
		this.addActionButton(actions, 'New project', 'folder-plus', () => {
			openProjectModal(this.plugin);
		});
	}

	private addActionButton(
		containerEl: HTMLElement,
		label: string,
		icon: string | null,
		run: () => void,
		primary = false,
	): void {
		const button = containerEl.createEl('button', {
			cls: `questline-dashboard-action${primary ? ' mod-cta' : ''}`,
			attr: { type: 'button' },
		});
		if (icon) {
			const iconEl = button.createSpan({
				cls: 'questline-dashboard-action-icon',
			});
			setIcon(iconEl, icon);
		}
		button.createSpan({ text: label });
		button.addEventListener('click', run);
	}

	private renderStatisticsLine(
		containerEl: HTMLElement,
		stats: readonly OverviewStat[],
	): void {
		containerEl.createDiv({
			cls: 'questline-dashboard-stats-line',
			text: stats
				.map((stat) => `${stat.label}: ${stat.value}`)
				.join(' · '),
		});
	}

	private renderCompactSection(
		containerEl: HTMLElement,
		title: string,
		count: number,
	): HTMLElement {
		const section = containerEl.createEl('section', {
			cls: 'questline-dashboard-compact-section',
		});
		section.createEl('h3', {
			cls: 'questline-dashboard-compact-section-title',
			text: `${title} (${count})`,
		});

		return section;
	}

	private renderCompactAttention(
		containerEl: HTMLElement,
		items: readonly AttentionItem[],
	): void {
		if (items.length === 0) return;

		const section = this.renderCompactSection(
			containerEl,
			'Needs attention',
			items.length,
		);
		const list = section.createEl('ul', {
			cls: 'questline-dashboard-compact-list',
		});

		for (const item of items) {
			const entry = list.createEl('li', {
				cls: 'questline-dashboard-compact-item',
			});
			const row = this.noteLink(
				entry,
				item.path,
				`Open ${item.name}`,
				'questline-dashboard-compact-row',
			);
			const header = row.createDiv({
				cls: 'questline-dashboard-compact-row-header',
			});
			header.createSpan({
				cls: 'questline-dashboard-compact-title',
				text: item.name,
			});
			header.createSpan({
				cls: 'questline-dashboard-compact-meta',
				text: item.detail,
			});
		}
	}

	private renderGoalTable(
		containerEl: HTMLElement,
		goals: readonly GoalOverviewItem[],
		noGoals: boolean,
		config: QuestlineConfig,
	): void {
		const section = this.renderCompactSection(
			containerEl,
			'Goals',
			goals.length,
		);

		if (goals.length === 0) {
			renderEmpty(
				section,
				noGoals ? 'No goals yet.' : 'No active goals.',
			);

			return;
		}

		const wrap = section.createDiv({
			cls: 'questline-dashboard-table-wrap',
		});
		const table = wrap.createEl('table', {
			cls: 'questline-dashboard-table',
		});
		const headers = [
			'Goal',
			'Category',
			'Progress',
			'Tasks',
			'Projects',
			'Due',
		];
		const head = table.createEl('thead').createEl('tr');
		for (const label of headers) head.createEl('th', { text: label });

		const body = table.createEl('tbody');

		for (const goal of goals) {
			const row = body.createEl('tr');
			const name = row.createEl('td');
			this.noteTextLink(
				name,
				goal.path,
				goal.name,
				`Open goal ${goal.name}`,
				'questline-dashboard-table-link',
			);
			row.createEl('td', { text: goal.category ?? '—' });

			const progress = row.createEl('td', {
				cls: 'questline-dashboard-table-progress',
			});
			renderProgressRow(
				progress,
				goal.counts.percent,
				`Goal progress: ${goal.name}`,
				config.progressBarStyle,
			);

			row.createEl('td', {
				cls: 'questline-dashboard-table-number',
				text: `${goal.counts.completed} / ${goal.counts.total}`,
			});
			row.createEl('td', {
				cls: 'questline-dashboard-table-number',
				text: String(goal.projectCount),
			});

			const due = row.createEl('td');
			const badge = dueBadge(goal);
			if (badge) {
				due.createSpan({
					cls:
						'questline-dashboard-due ' +
						`questline-dashboard-due--${badge.urgency}`,
					text: badge.text,
				});
			} else {
				due.createSpan({
					cls: 'questline-dashboard-table-number',
					text: '—',
				});
			}
		}
	}

	private renderProjectTable(
		containerEl: HTMLElement,
		projects: readonly ProjectOverviewItem[],
		config: QuestlineConfig,
	): void {
		const section = this.renderCompactSection(
			containerEl,
			'Projects in progress',
			projects.length,
		);

		if (projects.length === 0) {
			renderEmpty(section, 'No projects in progress.');

			return;
		}

		const wrap = section.createDiv({
			cls: 'questline-dashboard-table-wrap',
		});
		const table = wrap.createEl('table', {
			cls: 'questline-dashboard-table',
		});
		const headers = ['Project', 'Goals', 'Status', 'Progress', 'Tasks'];
		if (config.useTimekeep) headers.push('Hours');

		const head = table.createEl('thead').createEl('tr');
		for (const label of headers) head.createEl('th', { text: label });

		const body = table.createEl('tbody');

		for (const project of projects) {
			const row = body.createEl('tr');
			const name = row.createEl('td');
			this.noteTextLink(
				name,
				project.path,
				project.name,
				`Open project ${project.name}`,
				'questline-dashboard-table-link',
			);
			const goalCell = row.createEl('td');
			this.renderGoalLinks(
				goalCell,
				project.goals,
				'questline-dashboard-table-link',
			);
			row.createEl('td', { text: project.status ?? 'No status' });

			const progress = row.createEl('td', {
				cls: 'questline-dashboard-table-progress',
			});
			renderProgressRow(
				progress,
				project.counts.percent,
				`Project progress: ${project.name}`,
				config.progressBarStyle,
			);

			row.createEl('td', {
				cls: 'questline-dashboard-table-number',
				text: `${project.counts.completed} / ${project.counts.total}`,
			});

			if (config.useTimekeep) {
				row.createEl('td', {
					cls: 'questline-dashboard-table-number',
					text:
						project.hours !== null
							? formatTrackedHours(
									project.hours,
									config.trackedTimeFormat,
								)
							: '—',
				});
			}
		}
	}

	private renderAttention(
		containerEl: HTMLElement,
		items: readonly AttentionItem[],
	): void {
		if (items.length === 0) return;

		const urgent = items.some((item) => item.kind === 'overdue-goal');
		const panel = containerEl.createDiv({
			cls:
				'questline-dashboard-attention' +
				(urgent ? ' questline-dashboard-attention--urgent' : ''),
		});
		const header = panel.createDiv({
			cls: 'questline-dashboard-attention-header',
		});
		const icon = header.createSpan({
			cls: 'questline-dashboard-attention-icon',
		});
		setIcon(icon, 'alert-triangle');
		header.createSpan({
			cls: 'questline-dashboard-attention-title',
			text: 'Needs attention',
		});
		header.createSpan({
			cls: 'questline-dashboard-count',
			text: String(items.length),
		});

		const list = panel.createEl('ul', {
			cls: 'questline-dashboard-list',
		});

		for (const item of items) {
			const entry = list.createEl('li', {
				cls: 'questline-dashboard-item',
			});
			const row = this.noteLink(
				entry,
				item.path,
				`Open ${item.name}`,
				'questline-dashboard-row questline-dashboard-attention-row',
			);
			const rowHeader = row.createDiv({
				cls: 'questline-dashboard-row-header',
			});
			rowHeader.createSpan({
				cls: 'questline-dashboard-row-title',
				text: item.name,
			});
			rowHeader.createSpan({
				cls:
					'questline-dashboard-badge ' +
					(item.kind === 'overdue-goal'
						? 'questline-dashboard-badge--urgent'
						: 'questline-dashboard-badge--warning'),
				text: item.detail,
			});
		}
	}

	private renderGoals(
		containerEl: HTMLElement,
		goals: readonly GoalOverviewItem[],
		config: QuestlineConfig,
	): void {
		const visible = activeGoals(goals);
		const section = this.renderSection(
			containerEl,
			'Goals',
			visible.length,
		);

		if (visible.length === 0) {
			renderEmpty(
				section,
				goals.length === 0 ? 'No goals yet.' : 'No active goals.',
			);

			return;
		}

		this.renderGoalCategoryGroups(section, visible, config);
	}

	private renderGoalCategoryGroups(
		containerEl: HTMLElement,
		goals: readonly GoalOverviewItem[],
		config: QuestlineConfig,
	): void {
		for (const group of groupGoalsByCategory(goals)) {
			const category = categoryClass(group.category);
			const heading = containerEl.createDiv({
				cls: `questline-dashboard-category ${category}`,
			});
			heading.createSpan({
				cls: 'questline-dashboard-category-dot',
			});
			heading.createEl('h4', {
				cls: 'questline-dashboard-category-title',
				text: group.category ?? 'No category',
			});
			heading.createSpan({
				cls: 'questline-dashboard-count',
				text: String(group.goals.length),
			});

			const grid = containerEl.createDiv({
				cls: 'questline-dashboard-cards',
			});
			for (const goal of group.goals) {
				this.renderGoalCard(grid, goal, config);
			}
		}
	}

	private renderGoalCard(
		containerEl: HTMLElement,
		goal: GoalOverviewItem,
		config: QuestlineConfig,
		showCategory = false,
	): void {
		const card = this.noteLink(
			containerEl,
			goal.path,
			`Open goal ${goal.name}`,
			'questline-dashboard-card',
		);

		const header = card.createDiv({
			cls: 'questline-dashboard-card-header',
		});
		header.createSpan({
			cls: 'questline-dashboard-card-title',
			text: goal.name,
		});
		if (goal.archived) {
			header.createSpan({
				cls: 'questline-goals-archived-badge',
				text: 'Archived',
			});
		}

		const badge = dueBadge(goal);
		if (badge) {
			header.createSpan({
				cls:
					'questline-dashboard-due ' +
					`questline-dashboard-due--${badge.urgency}`,
				text: badge.text,
			});
		}

		renderProgressRow(
			card,
			goal.counts.percent,
			`Goal progress: ${goal.name}`,
			config.progressBarStyle,
		);

		const meta = card.createDiv({ cls: 'questline-dashboard-meta' });
		if (showCategory) {
			addMetaItem(meta, 'tag', goal.category ?? 'No category');
		}
		addMetaItem(
			meta,
			'list-checks',
			`${goal.counts.completed} / ${goal.counts.total} tasks`,
		);
		addMetaItem(
			meta,
			'folder',
			countLabel(goal.projectCount, 'project', 'projects'),
		);
		if (goal.hours !== null && goal.hours > 0) {
			addMetaItem(
				meta,
				'clock',
				`${formatTrackedHours(goal.hours, config.trackedTimeFormat)} tracked`,
			);
		}
	}

	private renderProjects(
		containerEl: HTMLElement,
		projects: readonly ProjectOverviewItem[],
		config: QuestlineConfig,
	): void {
		const section = this.renderSection(
			containerEl,
			'Projects in progress',
			projects.length,
		);

		if (projects.length === 0) {
			renderEmpty(section, 'No projects in progress.');

			return;
		}

		const grid = section.createDiv({
			cls: 'questline-dashboard-projects',
		});
		for (const project of projects) {
			this.renderProjectCard(grid, project, config);
		}
	}

	private renderProjectsBoard(
		containerEl: HTMLElement,
		projects: readonly ProjectOverviewItem[],
		config: QuestlineConfig,
	): void {
		const sorted = sortGoalProjects(
			projects,
			'name',
			'asc',
			config.projectStatuses,
		);
		const columns = boardColumns(
			sorted,
			config.projectStatuses,
			(project) => project.status,
			'No status',
		);

		renderBoard(containerEl, columns, {
			laneClass: (column) => statusClass(column.value),
			emptyText: 'No projects',
			renderCard: (cards, project) => {
				this.renderProjectCard(
					cards,
					project,
					config,
					true,
					true,
					true,
				);
			},
		});

		this.bindBoardDrop(containerEl, 'project');
		this.setupBoardKeyboard(containerEl);
	}

	private renderProjectCard(
		containerEl: HTMLElement,
		project: ProjectOverviewItem,
		config: QuestlineConfig,
		interactive = true,
		fullMeta = false,
		draggable = false,
	): void {
		const card = containerEl.createDiv({
			cls:
				'questline-dashboard-card questline-dashboard-project-card ' +
				statusClass(project.status) +
				(interactive ? '' : ' is-static') +
				(draggable ? ' questline-board-card' : ''),
		});
		if (draggable) {
			card.setAttr('tabindex', '-1');
			card.setAttr('role', 'button');
			card.setAttr(
				'aria-label',
				`Project ${project.name}. Enter opens the note, Space opens Move to.`,
			);
			card.setAttr('data-board-path', project.path);
		}
		if (interactive) {
			card.addEventListener('click', (event) => {
				if (draggable && !this.canOpenBoardCard()) return;

				revealOrOpen(this.plugin.app, project.path, event);
			});
		}

		const header = card.createDiv({
			cls: 'questline-dashboard-card-header',
		});
		const title = header.createEl('a', {
			cls: 'internal-link questline-dashboard-card-title',
			text: project.name,
			attr: { href: project.path },
		});
		title.addEventListener('click', (event) => {
			if (draggable && !this.canOpenBoardCard()) {
				event.preventDefault();
				event.stopPropagation();

				return;
			}

			event.stopPropagation();
			revealOrOpen(this.plugin.app, project.path, event);
		});
		header.createSpan({
			cls: 'questline-dashboard-status',
			text: project.status ?? 'No status',
		});
		if (draggable) {
			this.createBoardMoveButton(header, {
				kind: 'project',
				path: project.path,
				lane: project.status,
				name: project.name,
			});
		}

		if (project.subtitle) {
			card.createDiv({
				cls: 'questline-dashboard-subtitle',
				text: project.subtitle,
			});
		}

		renderProgressRow(
			card,
			project.counts.percent,
			`Project progress: ${project.name}`,
			config.progressBarStyle,
		);

		const meta = card.createDiv({ cls: 'questline-dashboard-meta' });
		if (project.goals.length === 0) {
			addMetaItem(meta, 'unlink', 'No goal');
		} else {
			for (const goal of project.goals) {
				const item = meta.createSpan({
					cls: 'questline-dashboard-meta-item',
				});
				const icon = item.createSpan({
					cls: 'questline-dashboard-meta-icon',
				});
				setIcon(icon, 'target');
				const goalLink = this.noteTextLink(
					item,
					goal.path,
					`Goal: ${goal.name}`,
					`Open goal ${goal.name}`,
					'questline-dashboard-goal-link',
					() => !draggable || this.canOpenBoardCard(),
				);
				goalLink.addEventListener('click', (event) => {
					event.stopPropagation();
				});
			}
		}
		addMetaItem(
			meta,
			'list-checks',
			`${project.counts.completed} / ${project.counts.total} tasks`,
		);
		if (project.authors.length > 0) {
			addMetaItem(meta, 'user', project.authors.join(', '));
		} else if (fullMeta) {
			addMetaItem(meta, 'user', 'None');
		}
		if (project.hours !== null && (project.hours > 0 || fullMeta)) {
			addMetaItem(
				meta,
				'clock',
				`${formatTrackedHours(project.hours, config.trackedTimeFormat)} tracked`,
			);
		}

		if (draggable) {
			this.enableBoardDrag(
				card,
				'project',
				project.path,
				project.status,
				project.name,
			);
		}
	}

	private createBoardMoveButton(
		containerEl: HTMLElement,
		ref: BoardCardState,
	): void {
		const button = containerEl.createEl('button', {
			cls: 'questline-board-move',
			attr: {
				type: 'button',
				'aria-label': `Move ${ref.name} to another lane`,
				'aria-haspopup': 'menu',
				'aria-expanded': 'false',
				title: 'Move to…',
			},
		});
		setIcon(button, 'move');
		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.toggleBoardMoveMenu(button, ref);
		});
	}

	private toggleBoardMoveMenu(
		trigger: HTMLElement,
		ref: BoardCardState,
	): void {
		if (this.boardMenu?.trigger === trigger) {
			this.closeBoardMoveMenu(false);

			return;
		}

		this.closeBoardMoveMenu(false);
		const board = trigger.closest('.questline-board');
		if (!board) return;

		const lanes = Array.from(
			board.querySelectorAll<HTMLElement>('.questline-board-lane'),
		).map((lane) => ({
			value:
				lane.dataset.laneNone === 'true'
					? null
					: lane.dataset.lane || null,
			label:
				lane
					.querySelector<HTMLElement>(
						'.questline-board-lane-title',
					)
					?.textContent?.trim() ?? '',
		}));
		const options = boardMoveOptions(lanes, ref.lane);

		const menu = document.body.createDiv({
			cls: 'questline-board-move-menu',
			attr: { role: 'menu', tabindex: '-1' },
		});
		const items: HTMLButtonElement[] = [];

		for (const option of options) {
			const item = menu.createEl('button', {
				cls: 'questline-board-move-item',
				text: option.label,
				attr: {
					type: 'button',
					role: 'menuitem',
				},
			});
			item.addEventListener('click', () => {
				this.closeBoardMoveMenu(true);
				void this.moveBoardItem(ref.kind, ref, option.value);
			});
			items.push(item);
		}

		if (items.length === 0) {
			menu.createDiv({
				cls: 'questline-board-move-empty',
				text: 'No other lanes',
			});
		}

		const triggerRect = trigger.getBoundingClientRect();
		menu.setCssProps({
			'--questline-menu-left': `${triggerRect.left}px`,
			'--questline-menu-top': `${triggerRect.bottom + 4}px`,
		});
		const menuRect = menu.getBoundingClientRect();
		const left = Math.max(
			8,
			Math.min(triggerRect.left, window.innerWidth - menuRect.width - 8),
		);
		let top = triggerRect.bottom + 4;
		if (top + menuRect.height > window.innerHeight - 8) {
			top = Math.max(8, triggerRect.top - menuRect.height - 4);
		}
		menu.setCssProps({
			'--questline-menu-left': `${left}px`,
			'--questline-menu-top': `${top}px`,
		});

		const onPointerDown = (event: PointerEvent): void => {
			const target = event.target;
			if (
				target instanceof Node &&
				(menu.contains(target) || trigger.contains(target))
			) {
				return;
			}

			this.closeBoardMoveMenu(false);
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') {
				event.preventDefault();
				this.closeBoardMoveMenu(true);

				return;
			}

			if (
				!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(
					event.key,
				) ||
				items.length === 0
			) {
				return;
			}

			event.preventDefault();
			const index = items.indexOf(
				document.activeElement as HTMLButtonElement,
			);
			let next = 0;
			if (event.key === 'ArrowDown') {
				next = index < 0 ? 0 : (index + 1) % items.length;
			} else if (event.key === 'ArrowUp') {
				next = index <= 0 ? items.length - 1 : index - 1;
			} else if (event.key === 'End') {
				next = items.length - 1;
			}

			items[next]?.focus();
		};
		const onFocusOut = (event: FocusEvent): void => {
			const next = event.relatedTarget;
			if (
				next instanceof Node &&
				(menu.contains(next) || trigger.contains(next))
			) {
				return;
			}

			this.closeBoardMoveMenu(false);
		};
		const onDismiss = (): void => {
			this.closeBoardMoveMenu(false);
		};

		document.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('scroll', onDismiss, true);
		window.addEventListener('resize', onDismiss);
		menu.addEventListener('keydown', onKeyDown);
		menu.addEventListener('focusout', onFocusOut);

		this.boardMenu = {
			menu,
			trigger,
			cleanup: () => {
				document.removeEventListener(
					'pointerdown',
					onPointerDown,
					true,
				);
				window.removeEventListener('scroll', onDismiss, true);
				window.removeEventListener('resize', onDismiss);
				menu.removeEventListener('keydown', onKeyDown);
				menu.removeEventListener('focusout', onFocusOut);
			},
		};
		trigger.setAttr('aria-expanded', 'true');
		(items[0] ?? menu).focus();
	}

	private closeBoardMoveMenu(refocus: boolean): void {
		const state = this.boardMenu;
		if (!state) return;

		this.boardMenu = null;
		state.cleanup();
		state.menu.remove();
		state.trigger.setAttr('aria-expanded', 'false');
		if (refocus) {
			const card = state.trigger.closest<HTMLElement>(
				'.questline-board-card',
			);
			(card ?? state.trigger).focus();
		}
	}

	private setupBoardKeyboard(containerEl: HTMLElement): void {
		const cards = Array.from(
			containerEl.querySelectorAll<HTMLElement>(
				'.questline-board-card',
			),
		);
		if (cards.length === 0) return;

		cards.forEach((card, index) => {
			card.setAttr('tabindex', index === 0 ? '0' : '-1');
			card
				.querySelectorAll<HTMLElement>('a, button')
				.forEach((element) => element.setAttr('tabindex', '-1'));
			card.addEventListener('focus', () => {
				for (const other of cards) {
					other.setAttr(
						'tabindex',
						other === card ? '0' : '-1',
					);
				}
			});
			card.addEventListener('keydown', (event) => {
				this.handleBoardCardKey(event, card, containerEl);
			});
		});
	}

	private handleBoardCardKey(
		event: KeyboardEvent,
		card: HTMLElement,
		containerEl: HTMLElement,
	): void {
		if (event.target !== card) return;

		if (event.key === 'Tab') {
			const cards = Array.from(
				containerEl.querySelectorAll<HTMLElement>(
					'.questline-board-card',
				),
			);
			if (cards.length > 0) {
				event.preventDefault();
				const index = Math.max(0, cards.indexOf(card));
				const step = event.shiftKey ? -1 : 1;
				const next = (index + step + cards.length) % cards.length;
				cards[next]?.focus();
			}

			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			this.leaveBoardFocus();

			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			if (!this.canOpenBoardCard()) return;

			const path = card.dataset.boardPath;
			if (path) revealOrOpen(this.plugin.app, path, event);

			return;
		}

		if (event.key === ' ' || event.key === 'Spacebar') {
			event.preventDefault();
			card.querySelector<HTMLElement>('.questline-board-move')?.click();

			return;
		}

		if (
			!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
				event.key,
			)
		) {
			return;
		}

		event.preventDefault();
		this.moveBoardFocus(card, containerEl, event.key);
	}

	private leaveBoardFocus(): void {
		const board = this.contentEl.querySelector<HTMLElement>(
			'.questline-board',
		);
		if (!board) return;

		const focusables = Array.from(
			this.contentEl.querySelectorAll<HTMLElement>(
				'button, input, select, textarea, [tabindex="0"], a[href]',
			),
		).filter(
			(element) =>
				!board.contains(element) &&
				!element.hasAttribute('disabled') &&
				element.tabIndex >= 0,
		);
		const last = focusables[focusables.length - 1];
		last?.focus();
	}

	private moveBoardFocus(		card: HTMLElement,
		containerEl: HTMLElement,
		key: string,
	): void {
		const lane = card.closest<HTMLElement>('.questline-board-lane');
		if (!lane) return;

		const lanes = Array.from(
			containerEl.querySelectorAll<HTMLElement>(
				'.questline-board-lane',
			),
		);
		const cardsIn = (element: HTMLElement): HTMLElement[] =>
			Array.from(
				element.querySelectorAll<HTMLElement>(
					'.questline-board-card',
				),
			);
		const laneIndex = lanes.indexOf(lane);

		if (key === 'ArrowLeft' || key === 'ArrowRight') {
			const index = cardsIn(lane).indexOf(card);
			const step = key === 'ArrowRight' ? 1 : -1;

			for (let i = laneIndex + step; i >= 0 && i < lanes.length; i += step) {
				const adjacent = lanes[i];
				if (!adjacent) continue;

				const candidates = cardsIn(adjacent);
				if (candidates.length === 0) continue;

				const target =
					candidates[
						Math.min(Math.max(index, 0), candidates.length - 1)
					];
				target?.focus();

				return;
			}

			return;
		}

		const cards = cardsIn(lane);
		const index = cards.indexOf(card);
		if (key === 'ArrowUp') {
			cards[Math.max(0, index - 1)]?.focus();
		} else if (key === 'ArrowDown') {
			cards[Math.min(cards.length - 1, index + 1)]?.focus();
		} else if (key === 'Home') {
			cards[0]?.focus();
		} else if (key === 'End') {
			cards[cards.length - 1]?.focus();
		}
	}

	private enableBoardDrag(
		card: HTMLElement,
		kind: BoardKind,
		path: string,
		lane: string | null,
		name: string,
	): void {
		card.setAttr('draggable', 'true');
		card.addEventListener('dragstart', (event) => {
			this.boardDrag = { kind, path, lane, name };
			this.boardDragEndedAt = Date.now();
			card.addClass('is-dragging');
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('text/plain', path);
			}
		});
		card.addEventListener('dragend', () => {
			card.removeClass('is-dragging');
			this.boardDrag = null;
			this.boardDragEndedAt = Date.now();
			this.clearBoardDropTargets();
		});
	}

	private canOpenBoardCard(): boolean {
		return Date.now() - this.boardDragEndedAt >= 250;
	}

	private bindBoardDrop(
		containerEl: HTMLElement,
		kind: BoardKind,
	): void {
		containerEl
			.querySelectorAll<HTMLElement>('.questline-board-lane')
			.forEach((lane) => {
				lane.addEventListener('dragover', (event) => {
					const drag = this.boardDrag;
					if (!drag || drag.kind !== kind) return;

					event.preventDefault();
					if (event.dataTransfer) {
						event.dataTransfer.dropEffect = 'move';
					}
					lane.addClass('is-drop-target');
				});
				lane.addEventListener('dragleave', (event) => {
					const related = event.relatedTarget;
					if (related instanceof Node && lane.contains(related)) return;

					lane.removeClass('is-drop-target');
				});
				lane.addEventListener('drop', (event) => {
					const drag = this.boardDrag;
					if (!drag || drag.kind !== kind) return;

					event.preventDefault();
					this.clearBoardDropTargets();
					this.boardDragEndedAt = Date.now();
					const target =
						lane.dataset.laneNone === 'true'
							? null
							: lane.dataset.lane || null;
					this.boardDrag = null;
					void this.moveBoardItem(kind, drag, target);
				});
			});
	}

	private clearBoardDropTargets(): void {
		this.contentEl
			.querySelectorAll<HTMLElement>(
				'.questline-board-lane.is-drop-target',
			)
			.forEach((lane) => lane.removeClass('is-drop-target'));
	}

	private async moveBoardItem(
		kind: BoardKind,
		drag: BoardCardState,
		target: string | null,
	): Promise<void> {
		if (this.boardWritePending) return;

		const patch = boardMovePatch(kind, drag.lane, target);
		if (!patch) return;

		const file = this.plugin.app.vault.getAbstractFileByPath(drag.path);
		if (!(file instanceof TFile)) {
			new Notice(`Could not find the ${kind} note.`);

			return;
		}

		this.boardWritePending = true;
		try {
			await this.plugin.app.fileManager.processFrontMatter(
				file,
				(frontmatter: Record<string, unknown>) => {
					applyBoardMove(frontmatter, patch);
				},
			);
		} catch {
			new Notice(`Could not move the ${kind}.`);
		} finally {
			this.boardWritePending = false;
		}
	}

	private renderSection(
		containerEl: HTMLElement,
		title: string,
		count: number,
	): HTMLElement {
		const section = containerEl.createEl('section', {
			cls: 'questline-dashboard-section',
		});
		const header = section.createDiv({
			cls: 'questline-dashboard-section-header',
		});
		header.createEl('h3', {
			cls: 'questline-dashboard-section-title',
			text: title,
		});
		header.createSpan({
			cls: 'questline-dashboard-count',
			text: String(count),
		});

		return section;
	}

	private noteLink(
		containerEl: HTMLElement,
		path: string,
		label: string,
		cls: string,
		guard?: () => boolean,
	): HTMLElement {
		const link = containerEl.createEl('a', {
			cls: `internal-link ${cls}`,
			attr: { href: path, 'aria-label': label },
		});
		link.addEventListener('click', (event) => {
			if (guard && !guard()) {
				event.preventDefault();

				return;
			}

			revealOrOpen(this.plugin.app, path, event);
		});

		return link;
	}

	private noteTextLink(
		containerEl: HTMLElement,
		path: string,
		text: string,
		label: string,
		cls: string,
		guard?: () => boolean,
	): HTMLElement {
		const link = this.noteLink(containerEl, path, label, cls, guard);
		link.setText(text);

		return link;
	}

	private renderGoalLinks(
		containerEl: HTMLElement,
		goals: readonly ProjectGoalLink[],
		cls: string,
	): void {
		if (goals.length === 0) {
			containerEl.createSpan({
				cls: 'questline-projects-none',
				text: '—',
			});

			return;
		}

		goals.forEach((goal, index) => {
			if (index > 0) containerEl.createSpan({ text: ', ' });

			this.noteTextLink(
				containerEl,
				goal.path,
				goal.name,
				`Open goal ${goal.name}`,
				cls,
			);
		});
	}
}

export function registerDashboardView(plugin: QuestlinePlugin): void {
	plugin.registerView(
		DASHBOARD_VIEW_TYPE,
		(leaf) => new QuestlineDashboardView(leaf, plugin),
	);
	plugin.addRibbonIcon('target', 'Open dashboard', () => {
		void openDashboard(plugin);
	});
	plugin.addCommand({
		id: 'open-dashboard',
		name: 'Open dashboard',
		callback: () => {
			void openDashboard(plugin);
		},
	});
	plugin.addCommand({
		id: 'focus-board',
		name: 'Focus board',
		checkCallback: (checking) => {
			const view =
				plugin.app.workspace.getActiveViewOfType(
					QuestlineDashboardView,
				);
			if (!view?.hasBoard()) return false;

			if (!checking) view.focusBoard();

			return true;
		},
	});
}

/** Focus the open dashboard, or open it in a new main-workspace tab. */
export async function openDashboard(plugin: QuestlinePlugin): Promise<void> {
	const { workspace } = plugin.app;
	const [existing] = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);

	if (existing) {
		await workspace.revealLeaf(existing);

		return;
	}

	const leaf = workspace.getLeaf('tab');
	await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
}
