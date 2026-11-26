import { describe, expect, it } from 'vitest';
import { boardColumns, type BoardColumn } from './board';

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
