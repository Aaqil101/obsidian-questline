/** The workspace dashboard: minimal tables, cards, and a due-date timeline. */
import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';
import { openGoalModal, openProjectModal } from '../creation/commands';
import type QuestlinePlugin from '../main';
import type { QuestlineConfig } from '../settings/types';
import {
	DEFAULT_GOAL_DIRECTION,
	DEFAULT_GOAL_SORT,
	GOAL_SORT_OPTIONS,
	filterGoals,
	goalCategoryOptions,
	sortGoals,
	type GoalListState,
} from './goal-list';
import { describeDue } from './model';
import { revealOrOpen } from './open';
import {
	activeGoals,
	dashboardData,
	dueUrgency,
	goalOverviewItems,
	groupGoalsByCategory,
	inProgressProjects,
	timelineBuckets,
	type AttentionItem,
	type DashboardData,
	type DueUrgency,
	type GoalOverviewItem,
	type OverviewStat,
	type ProjectOverviewItem,
} from './overview';
import { formatTrackedHours } from './projects';
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
	private activeTab: 'dashboard' | 'goals' = 'dashboard';
	private goalList: GoalListState = {
		search: '',
		category: '',
		showArchived: false,
		sort: DEFAULT_GOAL_SORT,
		direction: DEFAULT_GOAL_DIRECTION,
	};

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

	async onOpen(): Promise<void> {
		this.contentEl.addClass('questline-dashboard');
		this.unsubscribe = this.plugin.onIndexRefresh(() => this.render());
		this.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		const config = this.plugin.getConfig();
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

	private renderTabs(containerEl: HTMLElement): void {
		const tabs = containerEl.createDiv({
			cls: 'questline-tabs',
			attr: { role: 'tablist' },
		});

		const options: readonly { id: 'dashboard' | 'goals'; label: string }[] = [
			{ id: 'dashboard', label: 'Dashboard' },
			{ id: 'goals', label: 'Goals' },
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

		const sort = controls.createEl('select', {
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

		const direction = controls.createEl('button', {
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
		sort.addEventListener('change', () => {
			const next = GOAL_SORT_OPTIONS.find(
				(option) => option.value === sort.value,
			);
			this.goalList.sort = next?.value ?? DEFAULT_GOAL_SORT;
			refresh();
		});
		direction.addEventListener('click', () => {
			this.goalList.direction =
				this.goalList.direction === 'asc' ? 'desc' : 'asc';
			const ascending = this.goalList.direction === 'asc';
			direction.setText(ascending ? '↑' : '↓');
			direction.setAttr('title', ascending ? 'Ascending' : 'Descending');
			refresh();
		});
		clear.addEventListener('click', () => {
			this.goalList.search = '';
			this.goalList.category = '';
			this.goalList.showArchived = false;
			this.goalList.sort = DEFAULT_GOAL_SORT;
			this.goalList.direction = DEFAULT_GOAL_DIRECTION;
			search.value = '';
			category.value = '';
			archivedInput.checked = false;
			sort.value = DEFAULT_GOAL_SORT;
			direction.setText('↑');
			direction.setAttr('title', 'Ascending');
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
			this.noteLink(
				name,
				goal.path,
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
		const headers = ['Project', 'Goal', 'Status', 'Progress', 'Tasks'];
		if (config.useTimekeep) headers.push('Hours');

		const head = table.createEl('thead').createEl('tr');
		for (const label of headers) head.createEl('th', { text: label });

		const body = table.createEl('tbody');

		for (const project of projects) {
			const row = body.createEl('tr');
			const name = row.createEl('td');
			this.noteLink(
				name,
				project.path,
				`Open project ${project.name}`,
				'questline-dashboard-table-link',
			);
			row.createEl('td', { text: project.goal?.name ?? '—' });
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

	private renderProjectCard(
		containerEl: HTMLElement,
		project: ProjectOverviewItem,
		config: QuestlineConfig,
	): void {
		const card = containerEl.createDiv({
			cls:
				'questline-dashboard-card questline-dashboard-project-card ' +
				statusClass(project.status),
		});
		card.addEventListener('click', (event) => {
			revealOrOpen(this.plugin.app, project.path, event);
		});

		const header = card.createDiv({
			cls: 'questline-dashboard-card-header',
		});
		const title = header.createEl('a', {
			cls: 'internal-link questline-dashboard-card-title',
			text: project.name,
			attr: { href: project.path },
		});
		title.addEventListener('click', (event) => {
			event.stopPropagation();
			revealOrOpen(this.plugin.app, project.path, event);
		});
		header.createSpan({
			cls: 'questline-dashboard-status',
			text: project.status ?? 'No status',
		});

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
		const goal = project.goal;
		if (goal) {
			const item = meta.createSpan({
				cls: 'questline-dashboard-meta-item',
			});
			const icon = item.createSpan({
				cls: 'questline-dashboard-meta-icon',
			});
			setIcon(icon, 'target');
			const goalLink = item.createEl('a', {
				cls: 'internal-link questline-dashboard-goal-link',
				text: `Goal: ${goal.name}`,
				attr: { href: goal.path },
			});
			goalLink.addEventListener('click', (event) => {
				event.stopPropagation();
				revealOrOpen(this.plugin.app, goal.path, event);
			});
		} else {
			addMetaItem(meta, 'unlink', 'No goal');
		}
		addMetaItem(
			meta,
			'list-checks',
			`${project.counts.completed} / ${project.counts.total} tasks`,
		);
		if (project.authors.length > 0) {
			addMetaItem(meta, 'user', project.authors.join(', '));
		}
		if (project.hours !== null && project.hours > 0) {
			addMetaItem(
				meta,
				'clock',
				`${formatTrackedHours(project.hours, config.trackedTimeFormat)} tracked`,
			);
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
	): HTMLElement {
		const link = containerEl.createEl('a', {
			cls: `internal-link ${cls}`,
			attr: { href: path, 'aria-label': label },
		});
		link.addEventListener('click', (event) => {
			revealOrOpen(this.plugin.app, path, event);
		});

		return link;
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
