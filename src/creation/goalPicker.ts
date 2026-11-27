/** Shared goal picker and chips for project creation and editing. */
import { FuzzySuggestModal, type App } from 'obsidian';
import { withoutDate } from '../index/names';
import type { GoalNode } from '../index/types';

/** A goal is listed by its alias and title, so either one finds it. */
export function goalLabel(goal: GoalNode): string {
	const alias = goal.aliases[0]?.trim();
	const title = withoutDate(goal.name);

	if (alias && alias.toLowerCase() !== title.toLowerCase()) {
		return `${alias} (${title})`;
	}

	return alias || title;
}

class GoalPickModal extends FuzzySuggestModal<GoalNode> {
	constructor(
		app: App,
		private readonly goals: readonly GoalNode[],
		private readonly onPick: (goal: GoalNode) => void,
	) {
		super(app);
		this.emptyStateText = 'No goal matches that.';
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.setPlaceholder('Add a goal.');
	}

	getItems(): GoalNode[] {
		return [...this.goals];
	}

	getItemText(item: GoalNode): string {
		return goalLabel(item);
	}

	onChooseItem(item: GoalNode): void {
		this.onPick(item);
	}
}

export interface GoalPickerOptions {
	app: App;
	goals: readonly GoalNode[];
	selected: readonly GoalNode[];
	onChange: (goals: GoalNode[]) => void;
}

/**
 * The selected-goal chips and the fuzzy picker behind them. The caller owns
 * the Add goal button and calls `pick()`.
 */
export class GoalPicker {
	private selected: GoalNode[];
	private readonly containerEl: HTMLElement;
	private readonly options: GoalPickerOptions;

	constructor(containerEl: HTMLElement, options: GoalPickerOptions) {
		this.containerEl = containerEl;
		this.options = options;
		this.selected = [...options.selected];
		this.render();
	}

	getSelected(): GoalNode[] {
		return [...this.selected];
	}

	pick(): void {
		const available = this.options.goals.filter(
			(goal) =>
				!this.selected.some((item) => item.path === goal.path),
		);

		new GoalPickModal(this.options.app, available, (goal) => {
			this.selected = [...this.selected, goal];
			this.render();
			this.options.onChange(this.getSelected());
		}).open();
	}

	private render(): void {
		this.containerEl.empty();

		if (this.selected.length === 0) {
			this.containerEl.createDiv({
				cls: 'questline-goal-empty',
				text: 'No goals selected.',
			});

			return;
		}

		for (const goal of this.selected) {
			const row = this.containerEl.createDiv({
				cls: 'questline-goal-chip',
			});
			const label = goalLabel(goal);
			row.createSpan({
				cls: 'questline-goal-chip-label',
				text: label,
			});
			const remove = row.createEl('button', {
				cls: 'questline-goal-chip-remove',
				text: '×',
				attr: {
					type: 'button',
					'aria-label': `Remove ${label}`,
				},
			});
			remove.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.selected = this.selected.filter(
					(item) => item.path !== goal.path,
				);
				this.render();
				this.options.onChange(this.getSelected());
			});
		}
	}
}
