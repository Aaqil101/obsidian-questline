/** Per-project open, edit, and status actions for the dashboard. */
import { Menu, Notice, TFile, setIcon, type App } from 'obsidian';
import { editFrontmatter, setFrontmatterKey } from '../creation/frontmatter';
import type QuestlinePlugin from '../main';
import type { ProjectOverviewItem } from './overview';
import { openOrReveal, revealOrOpen } from './open';

export interface ProjectActionContext {
	plugin: QuestlinePlugin;
	/** Statuses offered by the Set status menu. */
	statuses: readonly string[];
	onEdit: (path: string) => void;
	/** Source path for generated markdown links. */
	sourcePath?: string;
}

function projectFile(app: App, path: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(path);

	if (file instanceof TFile) return file;

	new Notice('This project is no longer in the vault.');

	return null;
}

function addIconButton(
	containerEl: HTMLElement,
	icon: string,
	label: string,
	run: (event: MouseEvent) => void,
): void {
	const button = containerEl.createEl('button', {
		cls: 'questline-project-action',
		attr: { type: 'button', 'aria-label': label, title: label },
	});
	setIcon(button, icon);
	button.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		run(event);
	});
}

export function renderProjectActions(
	containerEl: HTMLElement,
	project: ProjectOverviewItem,
	context: ProjectActionContext,
	compact = false,
	showOpen = true,
	showMenu = true,
): void {
	const { app } = context.plugin;

	if (!compact) {
		if (showOpen) {
			addIconButton(
				containerEl,
				'external-link',
				`Open ${project.name}`,
				(event) => {
					if (!projectFile(app, project.path)) return;
					revealOrOpen(app, project.path, event);
				},
			);
		}
		addIconButton(
			containerEl,
			'pencil',
			`Edit ${project.name}`,
			() => context.onEdit(project.path),
		);
	}

	if (!showMenu) return;

	const more = containerEl.createEl('button', {
		cls: 'questline-project-action',
		attr: {
			type: 'button',
			'aria-label': `More actions for ${project.name}`,
			'aria-haspopup': 'menu',
			title: 'More actions',
		},
	});
	setIcon(more, compact ? 'more-vertical' : 'more-horizontal');
	more.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		openActionsMenu(event, project, context);
	});
}

function openActionsMenu(
	event: MouseEvent,
	project: ProjectOverviewItem,
	context: ProjectActionContext,
): void {
	const { app } = context.plugin;
	const statuses = [...context.statuses];
	const current = project.status?.trim();
	if (
		current &&
		!statuses.some(
			(status) => status.toLowerCase() === current.toLowerCase(),
		)
	) {
		statuses.push(current);
	}

	const menu = new Menu();
	menu.addItem((item) =>
		item
			.setTitle('Open')
			.setIcon('file')
			.onClick(() => {
				if (projectFile(app, project.path)) {
					openOrReveal(app, project.path);
				}
			}),
	);
	menu.addItem((item) =>
		item
			.setTitle('Open in new tab')
			.setIcon('external-link')
			.onClick(() => {
				if (projectFile(app, project.path)) {
					openOrReveal(app, project.path, true);
				}
			}),
	);
	menu.addItem((item) =>
		item
			.setTitle('Edit')
			.setIcon('pencil')
			.onClick(() => context.onEdit(project.path)),
	);

	if (statuses.length > 0) {
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle('Set status').setIcon('circle-dot').setDisabled(true),
		);
		for (const status of statuses) {
			const active =
				(current?.toLowerCase() ?? '') === status.toLowerCase();
			menu.addItem((item) =>
				item
					.setTitle(status)
					.setChecked(active)
					.onClick(() => {
						void setProjectStatus(app, project.path, status);
					}),
			);
		}
	}

	menu.addSeparator();
	menu.addItem((item) =>
		item
			.setTitle('Copy link')
			.setIcon('link')
			.onClick(() => {
				void copyProjectLink(app, project, context.sourcePath);
			}),
	);

	menu.showAtMouseEvent(event);
}

/**
 * Frontmatter wins over an inline status, so writing the key here changes the
 * resolved status even when the note also carries `status::` in its body.
 */
async function setProjectStatus(
	app: App,
	path: string,
	status: string,
): Promise<void> {
	const file = projectFile(app, path);
	if (!file) return;

	try {
		await editFrontmatter(app, file, (frontmatter) => {
			setFrontmatterKey(frontmatter, 'status', status);
		});
		new Notice(`Set ${file.basename} to ${status}.`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Questline could not change the status: ${message}`);
	}
}

async function copyProjectLink(
	app: App,
	project: ProjectOverviewItem,
	sourcePath = '',
): Promise<void> {
	const file = projectFile(app, project.path);
	if (!file) return;

	try {
		const link = app.fileManager.generateMarkdownLink(file, sourcePath);
		await navigator.clipboard.writeText(link);
		new Notice('Copied the project link.');
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Questline could not copy the link: ${message}`);
	}
}
