/** Per-goal edit and category actions for dashboard cards and tables. */
import { Menu, Notice, TFile, setIcon, type App } from 'obsidian';
import {
	editFrontmatter,
	removeFrontmatterKey,
	setFrontmatterKey,
} from '../creation/frontmatter';
import type QuestlinePlugin from '../main';
import type { GoalOverviewItem } from './overview';
import { openOrReveal } from './open';

export interface GoalActionContext {
	plugin: QuestlinePlugin;
	/** Categories offered by the Set category menu. */
	categories: readonly string[];
	onEdit: (path: string) => void;
	sourcePath?: string;
}

function goalFile(app: App, path: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(path);

	if (file instanceof TFile) return file;

	new Notice('This goal is no longer in the vault.');

	return null;
}

function addIconButton(
	containerEl: HTMLElement,
	icon: string,
	label: string,
	run: (event: MouseEvent) => void,
): void {
	const button = containerEl.createEl('button', {
		cls: 'questline-goal-action',
		attr: { type: 'button', 'aria-label': label, title: label },
	});
	setIcon(button, icon);
	button.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		run(event);
	});
}

export function renderGoalActions(
	containerEl: HTMLElement,
	goal: GoalOverviewItem,
	context: GoalActionContext,
): void {
	addIconButton(containerEl, 'pencil', `Edit goal ${goal.name}`, () => {
		context.onEdit(goal.path);
	});

	const more = containerEl.createEl('button', {
		cls: 'questline-goal-action',
		attr: {
			type: 'button',
			'aria-label': `More actions for ${goal.name}`,
			'aria-haspopup': 'menu',
			title: 'More actions',
		},
	});
	setIcon(more, 'more-horizontal');
	more.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		openActionsMenu(event, goal, context);
	});
}

function openActionsMenu(
	event: MouseEvent,
	goal: GoalOverviewItem,
	context: GoalActionContext,
): void {
	const { app } = context.plugin;
	const categories = [...context.categories];
	const current = goal.category?.trim();
	if (
		current &&
		!categories.some(
			(category) => category.toLowerCase() === current.toLowerCase(),
		)
	) {
		categories.push(current);
	}

	const menu = new Menu();
	menu.addItem((item) =>
		item
			.setTitle('Open')
			.setIcon('file')
			.onClick(() => {
				if (goalFile(app, goal.path)) {
					openOrReveal(app, goal.path);
				}
			}),
	);
	menu.addItem((item) =>
		item
			.setTitle('Open in new tab')
			.setIcon('external-link')
			.onClick(() => {
				if (goalFile(app, goal.path)) {
					openOrReveal(app, goal.path, true);
				}
			}),
	);
	menu.addItem((item) =>
		item
			.setTitle('Edit')
			.setIcon('pencil')
			.onClick(() => context.onEdit(goal.path)),
	);

	menu.addSeparator();
	menu.addItem((item) =>
		item.setTitle('Set category').setIcon('tag').setDisabled(true),
	);
	for (const category of categories) {
		const active =
			(current?.toLowerCase() ?? '') === category.toLowerCase();
		menu.addItem((item) =>
			item
				.setTitle(category)
				.setChecked(active)
				.onClick(() => {
					void setGoalCategory(app, goal.path, category);
				}),
		);
	}
	menu.addItem((item) =>
		item
			.setTitle('No category')
			.setChecked(!current)
			.onClick(() => {
				void setGoalCategory(app, goal.path, null);
			}),
	);

	menu.addSeparator();
	menu.addItem((item) =>
		item
			.setTitle('Copy link')
			.setIcon('link')
			.onClick(() => {
				void copyGoalLink(app, goal, context.sourcePath);
			}),
	);

	menu.showAtMouseEvent(event);
}

/**
 * Clearing the category also clears the legacy `status` fallback, so the goal
 * really moves to the no-category lane.
 */
async function setGoalCategory(
	app: App,
	path: string,
	category: string | null,
): Promise<void> {
	const file = goalFile(app, path);
	if (!file) return;

	try {
		await editFrontmatter(app, file, (frontmatter) => {
			if (category) {
				setFrontmatterKey(frontmatter, 'category', category);
			} else {
				removeFrontmatterKey(frontmatter, 'category');
				removeFrontmatterKey(frontmatter, 'status');
			}
		});
		new Notice(
			category
				? `Set ${file.basename} to ${category}.`
				: `Cleared the category for ${file.basename}.`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Questline could not change the category: ${message}`);
	}
}

async function copyGoalLink(
	app: App,
	goal: GoalOverviewItem,
	sourcePath = '',
): Promise<void> {
	const file = goalFile(app, goal.path);
	if (!file) return;

	try {
		const link = app.fileManager.generateMarkdownLink(file, sourcePath);
		await navigator.clipboard.writeText(link);
		new Notice('Copied the goal link.');
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Questline could not copy the link: ${message}`);
	}
}
