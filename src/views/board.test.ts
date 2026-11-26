import { describe, expect, it } from 'vitest';
import {
	applyBoardMove,
	boardColumns,
	boardMovePatch,
	type BoardColumn,
} from './board';

interface Item {
	name: string;
	lane: string | null;
}

function item(name: string, lane: string | null): Item {
	return { name, lane };
}

function summarise(
	columns: readonly BoardColumn<Item>[],
): [string | null, string, string[]][] {
	return columns.map((column) => [
		column.value,
		column.label,
		column.items.map((entry) => entry.name),
	]);
}

const readLane = (entry: Item): string | null => entry.lane;

describe('boardColumns', () => {
	it('returns configured lanes in order, including empty ones', () => {
		const columns = boardColumns(
			[item('Alpha', 'Professional'), item('Beta', 'Learning')],
			['Professional', 'Personal', 'Learning'],
			readLane,
		);

		expect(summarise(columns)).toEqual([
			['Professional', 'Professional', ['Alpha']],
			['Personal', 'Personal', []],
			['Learning', 'Learning', ['Beta']],
		]);
	});

	it('matches configured values case-insensitively and keeps their label', () => {
		const columns = boardColumns(
			[item('Alpha', 'personal'), item('Beta', 'PERSONAL')],
			['Professional', 'Personal'],
			readLane,
		);

		expect(summarise(columns)).toEqual([
			['Professional', 'Professional', []],
			['Personal', 'Personal', ['Alpha', 'Beta']],
		]);
	});

	it('adds unknown lanes in text order with the first spelling', () => {
		const columns = boardColumns(
			[
				item('One', 'zeta'),
				item('Two', 'Alpha'),
				item('Three', 'alpha'),
			],
			['Professional'],
			readLane,
		);

		expect(summarise(columns)).toEqual([
			['Professional', 'Professional', []],
			['Alpha', 'Alpha', ['Two', 'Three']],
			['zeta', 'zeta', ['One']],
		]);
	});

	it('adds a no-value lane only when an item has no value', () => {
		const withNone = boardColumns(
			[item('Alpha', null), item('Beta', '  ')],
			['Professional'],
			readLane,
			'No category',
		);
		const withoutNone = boardColumns(
			[item('Alpha', 'Professional')],
			['Professional'],
			readLane,
			'No category',
		);

		expect(summarise(withNone)).toEqual([
			['Professional', 'Professional', []],
			[null, 'No category', ['Alpha', 'Beta']],
		]);
		expect(withoutNone).toHaveLength(1);
	});

	it('deduplicates configured values and skips blank ones', () => {
		const columns = boardColumns(
			[],
			['Professional', 'professional', '  ', 'Personal'],
			readLane,
		);

		expect(summarise(columns)).toEqual([
			['Professional', 'Professional', []],
			['Personal', 'Personal', []],
		]);
	});

	it('returns configured lanes for an empty item list', () => {
		const columns = boardColumns([], ['Todo', 'Done'], readLane);

		expect(columns).toHaveLength(2);
		expect(columns.every((column) => column.items.length === 0)).toBe(true);
	});
});

describe('boardMovePatch', () => {
	it('moves a goal to a category lane', () => {
		expect(boardMovePatch('goal', 'Personal', 'Professional')).toEqual({
			set: { category: 'Professional' },
			remove: [],
		});
	});

	it('clears goal category and the legacy status in the no-value lane', () => {
		expect(boardMovePatch('goal', 'Personal', null)).toEqual({
			set: {},
			remove: ['category', 'status'],
		});
	});

	it('moves a project to a status lane', () => {
		expect(boardMovePatch('project', 'Todo', 'In Progress')).toEqual({
			set: { status: 'In Progress' },
			remove: [],
		});
	});

	it('clears a project status in the no-value lane', () => {
		expect(boardMovePatch('project', 'Todo', null)).toEqual({
			set: {},
			remove: ['status'],
		});
	});

	it('returns null for the same lane, case and space insensitively', () => {
		expect(boardMovePatch('goal', 'personal', ' Personal ')).toBeNull();
		expect(boardMovePatch('project', null, '')).toBeNull();
		expect(boardMovePatch('project', '  ', null)).toBeNull();
	});

	it('keeps an unknown target label as written', () => {
		expect(boardMovePatch('project', 'Todo', 'Blocked')).toEqual({
			set: { status: 'Blocked' },
			remove: [],
		});
	});
});

describe('applyBoardMove', () => {
	it('updates an existing key without changing its casing', () => {
		const frontmatter: Record<string, unknown> = { Category: 'Personal' };

		applyBoardMove(frontmatter, {
			set: { category: 'Professional' },
			remove: [],
		});

		expect(frontmatter).toEqual({ Category: 'Professional' });
	});

	it('adds a lowercase key when the note has none', () => {
		const frontmatter: Record<string, unknown> = {};

		applyBoardMove(frontmatter, {
			set: { status: 'Todo' },
			remove: [],
		});

		expect(frontmatter).toEqual({ status: 'Todo' });
	});

	it('removes keys case-insensitively', () => {
		const frontmatter: Record<string, unknown> = {
			Category: 'Personal',
			Status: 'Professional',
			Reason: 'Keep me',
		};

		applyBoardMove(frontmatter, {
			set: {},
			remove: ['category', 'status'],
		});

		expect(frontmatter).toEqual({ Reason: 'Keep me' });
	});
});
