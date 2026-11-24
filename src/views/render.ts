/** Shared DOM helpers for the progress blocks and the workspace views. */
import type { ProgressBarStyle } from '../settings/types';
import { thresholdStage } from './bar';

export function renderProgressRow(
	containerEl: HTMLElement,
	percent: number,
	label: string,
	style: ProgressBarStyle,
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
	if (style === 'threshold') {
		fill.addClass(
			`questline-progress-fill--threshold-${thresholdStage(percent)}`,
		);
	} else {
		fill.addClass(`questline-progress-fill--${style}`);
	}
	fill.setCssStyles({ width: `${Math.max(0, Math.min(100, percent))}%` });

	row.createSpan({ cls: 'questline-percent', text: `${percent}%` });
}

export type Stat = string | { text: string; path: string };

export function renderStats(
	containerEl: HTMLElement,
	stats: readonly Stat[],
	open?: (path: string, event: MouseEvent) => void,
): void {
	const row = containerEl.createDiv({ cls: 'questline-stats' });

	for (const stat of stats) {
		if (typeof stat === 'string') {
			row.createSpan({ cls: 'questline-stat', text: stat });
			continue;
		}

		const span = row.createSpan({ cls: 'questline-stat' });
		const link = span.createEl('a', {
			cls: 'internal-link',
			text: stat.text,
		});
		link.setAttr('href', stat.path);
		if (open) {
			link.addEventListener('click', (event) => {
				open(stat.path, event);
			});
		}
	}
}

export function renderEmpty(containerEl: HTMLElement, text: string): void {
	containerEl.createDiv({ cls: 'questline-empty', text });
}

export function countLabel(
	count: number,
	singular: string,
	plural: string,
): string {
	return `${count} ${count === 1 ? singular : plural}`;
}
