/** Shared lane grouping and rendering for the Goals and Projects boards. */
import type { BoardDirection } from '../settings/types';
import { compareText } from './projects';

export interface BoardColumn<T> {
	/** Configured or first-seen label, or null for the no-value lane. */
	value: string | null;
	/** Text shown in the lane header. */
	label: string;
	items: T[];
}

export interface BoardRenderOptions<T> {
	/** Render one card inside a lane body. */
	renderCard: (containerEl: HTMLElement, item: T) => void;
	/** Extra classes for a lane, such as a status or category color. */
	laneClass?: (column: BoardColumn<T>) => string;
	/** Message shown in a lane with no cards. Defaults to `No items`. */
	emptyText?: string;
	/** Whether lanes stack vertically or sit side by side. */
	direction?: BoardDirection;
}

export type BoardKind = 'goal' | 'project';

export interface BoardMovePatch {
	/** Frontmatter keys to set. */
	set: Record<string, string>;
	/** Frontmatter keys to remove. */
	remove: string[];
}

export interface BoardLaneOption {
	value: string | null;
	label: string;
}

/** Lanes offered by a card's Move to… menu: every lane except its own. */
export function boardMoveOptions(
	lanes: readonly BoardLaneOption[],
	current: string | null,
): BoardLaneOption[] {
	return lanes.filter((lane) => !sameLane(lane.value, current));
}

function sameLane(left: string | null, right: string | null): boolean {
	return (left?.trim().toLowerCase() ?? '') ===
		(right?.trim().toLowerCase() ?? '');
}

/**
 * The frontmatter change for dropping a card on a lane, or null when the
 * drop would not change the note. Goal cards write `category`; the no-value
 * lane also clears the legacy `status` fallback. Project cards write
 * `status`.
 */
export function boardMovePatch(
	kind: BoardKind,
	current: string | null,
	target: string | null,
): BoardMovePatch | null {
	const next = target?.trim() || null;
	if (sameLane(current, next)) return null;

	if (kind === 'goal') {
		return next
			? { set: { category: next }, remove: [] }
			: { set: {}, remove: ['category', 'status'] };
	}

	return next
		? { set: { status: next }, remove: [] }
		: { set: {}, remove: ['status'] };
}

/**
 * Apply a move patch without duplicating a differently-cased key. Obsidian
 * preserves frontmatter key casing, so `Category` and `category` must be the
 * same field here.
 */
export function applyBoardMove(
	frontmatter: Record<string, unknown>,
	patch: BoardMovePatch,
): void {
	const findKey = (key: string): string | undefined =>
		Object.keys(frontmatter).find(
			(name) => name.toLowerCase() === key.toLowerCase(),
		);

	for (const key of patch.remove) {
		const existing = findKey(key);
		if (existing) delete frontmatter[existing];
	}

	for (const [key, value] of Object.entries(patch.set)) {
		const existing = findKey(key);
		frontmatter[existing ?? key] = value;
	}
}

/**
 * Group items into ordered lanes.
 *
 * Configured values always appear, in their configured order. Values from the
 * items that are not configured follow in text order, using the first spelling
 * seen. Items without a value go to a final lane that only exists when needed.
 * Item order is preserved inside every lane.
 */
export function boardColumns<T>(
	items: readonly T[],
	values: readonly string[],
	readValue: (item: T) => string | null,
	noValueLabel = 'No value',
): BoardColumn<T>[] {
	const known = new Map<string, BoardColumn<T>>();
	const configured: BoardColumn<T>[] = [];

	for (const value of values) {
		const label = value.trim();
		if (!label) continue;

		const key = label.toLowerCase();
		if (known.has(key)) continue;

		const column: BoardColumn<T> = { value: label, label, items: [] };
		known.set(key, column);
		configured.push(column);
	}

	const unknown = new Map<string, BoardColumn<T>>();
	const noValue: BoardColumn<T> = {
		value: null,
		label: noValueLabel,
		items: [],
	};

	for (const item of items) {
		const value = readValue(item)?.trim() ?? '';
		if (!value) {
			noValue.items.push(item);
			continue;
		}

		const key = value.toLowerCase();
		const column = known.get(key);
		if (column) {
			column.items.push(item);
			continue;
		}

		const other = unknown.get(key);
		if (other) {
			other.items.push(item);
			continue;
		}

		const created: BoardColumn<T> = {
			value,
			label: value,
			items: [item],
		};
		unknown.set(key, created);
	}

	const columns = [
		...configured,
		...[...unknown.values()].sort((left, right) =>
			compareText(left.label, right.label),
		),
	];
	if (noValue.items.length > 0) columns.push(noValue);

	return columns;
}

/** Paint a horizontal board of lanes and cards. */
export function renderBoard<T>(
	containerEl: HTMLElement,
	columns: readonly BoardColumn<T>[],
	options: BoardRenderOptions<T>,
): void {
	const direction = options.direction ?? 'vertical';
	const board = containerEl.createDiv({
		cls: `questline-board questline-board--${direction}`,
	});

	for (const column of columns) {
		const extra = options.laneClass?.(column) ?? '';
		const lane = board.createDiv({
			cls: `questline-board-lane${extra ? ` ${extra}` : ''}`,
			attr: { 'data-lane': column.value ?? '' },
		});
		if (column.value === null) lane.setAttr('data-lane-none', 'true');

		const header = lane.createDiv({
			cls: 'questline-board-lane-header',
		});
		header.createSpan({
			cls: 'questline-board-lane-title',
			text: column.label,
		});
		header.createSpan({
			cls: 'questline-board-count',
			text: String(column.items.length),
		});

		const cards = lane.createDiv({ cls: 'questline-board-cards' });
		if (column.items.length === 0) {
			cards.createDiv({
				cls: 'questline-board-empty',
				text: options.emptyText ?? 'No items',
			});
			continue;
		}

		for (const item of column.items) {
			options.renderCard(cards, item);
		}
	}
}
