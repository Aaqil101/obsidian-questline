/**
 * Markdown code blocks that render live progress. Each block subscribes to
 * index refreshes, so a checkbox or frontmatter change repaints in place.
 * The same processors run in Reading view and Live Preview.
 */
import { MarkdownRenderChild } from 'obsidian';
import type QuestlinePlugin from '../main';
import { describeDue, goalProgressView } from './model';

const NOT_A_GOAL =
	'This note is not a goal. Add the goal tag to show progress.';
const NO_GOAL_DATA =
	'No tasks or projects yet. Add tasks to this goal or link a project.';

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

function renderProgressRow(
	containerEl: HTMLElement,
	percent: number,
	label: string,
): void {
	const row = containerEl.createDiv({ cls: 'questline-progress-row' });
	const bar = row.createDiv({
		cls: 'questline-progress',
		attr: {
			role: 'progressbar',
			'aria-valuemin': '0',
			'aria-valuemax': '100',
			'aria-valuenow': String(percent),
			'aria-label': label,
		},
	});
	const fill = bar.createDiv({ cls: 'questline-progress-fill' });
	fill.setCssStyles({ width: `${Math.max(0, Math.min(100, percent))}%` });

	row.createSpan({ cls: 'questline-percent', text: `${percent}%` });
}

function renderStats(containerEl: HTMLElement, stats: readonly string[]): void {
	const row = containerEl.createDiv({ cls: 'questline-stats' });

	for (const stat of stats) row.createSpan({ cls: 'questline-stat', text: stat });
}

function renderEmpty(containerEl: HTMLElement, text: string): void {
	containerEl.createDiv({ cls: 'questline-empty', text });
}

function countLabel(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

class GoalProgressBlock extends QuestlineBlock {
	protected paintBlock(containerEl: HTMLElement): void {
		const index = this.plugin.getIndex();
		const goal = index.goalByPath.get(this.sourcePath);

		if (!goal) {
			renderEmpty(containerEl, NOT_A_GOAL);

			return;
		}

		const view = goalProgressView(
			index,
			goal,
			this.plugin.getConfig(),
			new Date(),
		);

		if (view.empty) {
			renderEmpty(containerEl, NO_GOAL_DATA);

			return;
		}

		renderProgressRow(
			containerEl,
			view.counts.percent,
			`Goal progress: ${view.name}`,
		);
		renderStats(containerEl, [
			`${view.counts.completed} / ${view.counts.total} tasks`,
			countLabel(view.projectCount, 'project', 'projects'),
			describeDue(view.due),
		]);
	}
}

export function registerProgressBlocks(plugin: QuestlinePlugin): void {
	plugin.registerMarkdownCodeBlockProcessor(
		'goal-progress',
		(_source, el, ctx) => {
			ctx.addChild(new GoalProgressBlock(el, plugin, ctx.sourcePath));
		},
	);
}
