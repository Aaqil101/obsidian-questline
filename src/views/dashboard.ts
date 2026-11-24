/** The workspace dashboard: an overview of every goal and active project. */
import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';
import { openGoalModal, openProjectModal } from '../creation/commands';
import type QuestlinePlugin from '../main';
import type { QuestlineConfig } from '../settings/types';
import { revealOrOpen } from './open';
import {
	activeGoals,
	dashboardData,
	dueUrgency,
	groupGoalsByCategory,
	inProgressProjects,
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
		const data = dashboardData(
			this.plugin.getIndex(),
			config,
			new Date(),
		);

		this.renderHeader(contentEl, data);

		if (data.goals.length === 0 && data.projects.length === 0) {
			renderEmpty(
				contentEl,
				'No goals or projects yet. Create a goal to get started.',
			);

			return;
		}

		renderStatCards(contentEl, data.stats);
		this.renderAttention(contentEl, data.attention);
		this.renderGoals(contentEl, data.goals, config);
		this.renderProjects(
			contentEl,
			inProgressProjects(data.projects),
			config,
		);
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
		icon: string,
		run: () => void,
		primary = false,
	): void {
		const button = containerEl.createEl('button', {
			cls: `questline-dashboard-action${primary ? ' mod-cta' : ''}`,
			attr: { type: 'button' },
		});
		const iconEl = button.createSpan({
			cls: 'questline-dashboard-action-icon',
		});
		setIcon(iconEl, icon);
		button.createSpan({ text: label });
		button.addEventListener('click', run);
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

		for (const group of groupGoalsByCategory(visible)) {
			const category = categoryClass(group.category);
			const heading = section.createDiv({
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

			const grid = section.createDiv({
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
