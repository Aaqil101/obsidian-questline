import { describe, expect, it } from 'vitest';
import {
	extractTimekeepBlocks,
	findTimekeepApi,
	sumTimekeepBlocks,
	sumWorkHours,
	TimekeepCache,
	type TimekeepApi,
} from './timekeep';

function fence(payload: string): string {
	return ['```timekeep', payload, '```'].join('\n');
}

const closed = fence(
	JSON.stringify({
		entries: [
			{
				name: 'Work',
				startTime: '2025-01-01T10:00:00.000Z',
				endTime: '2025-01-01T11:30:00.000Z',
				subEntries: null,
			},
		],
	}),
);

const now = new Date('2025-01-01T12:00:00.000Z');

describe('extractTimekeepBlocks', () => {
	it('parses every timekeep block in a note', () => {
		const body = [
			'# Notes',
			closed,
			'some prose',
			fence(
				JSON.stringify({
					entries: [
						{
							startTime: '2025-01-02T10:00:00.000Z',
							endTime: '2025-01-02T10:30:00.000Z',
							subEntries: null,
						},
					],
				}),
			),
		].join('\n');

		expect(extractTimekeepBlocks(body)).toHaveLength(2);
	});

	it('reads an empty block as no entries', () => {
		const blocks = extractTimekeepBlocks(['```timekeep', '', '```'].join('\n'));

		expect(blocks).toEqual([{ entries: [] }]);
	});

	it('skips malformed, unclosed, and non-timekeep blocks', () => {
		const body = [
			fence('{not json'),
			'```timekeep',
			'{"entries":[]}',
			'```json',
			'{}',
			'```',
		].join('\n');

		expect(extractTimekeepBlocks(body)).toEqual([]);
	});

	it('drops entries with the wrong timestamp types', () => {
		const blocks = extractTimekeepBlocks(
			fence(
				JSON.stringify({
					entries: [
						{ startTime: 123, endTime: null, subEntries: null },
						{ startTime: null, endTime: null, subEntries: null },
					],
				}),
			),
		);

		expect(blocks).toEqual([
			{ entries: [{ name: undefined, startTime: null, endTime: null, subEntries: null }] },
		]);
	});
});

describe('sumTimekeepBlocks', () => {
	it('sums closed entries', () => {
		const result = sumWorkHours(closed, { now });

		expect(result).toMatchObject({
			ms: 5_400_000,
			hours: 1.5,
			openEntries: 0,
			blocks: 1,
		});
	});

	it('counts an open entry up to now', () => {
		const body = fence(
			JSON.stringify({
				entries: [
					{
						startTime: '2025-01-01T11:30:00.000Z',
						endTime: null,
						subEntries: null,
					},
				],
			}),
		);

		expect(sumWorkHours(body, { now })).toMatchObject({
			hours: 0.5,
			openEntries: 1,
		});
	});

	it('sums multiple blocks', () => {
		const body = [closed, closed].join('\n\n');

		expect(sumWorkHours(body, { now })).toMatchObject({
			hours: 3,
			blocks: 2,
		});
	});

	it('uses only child durations for nested entries', () => {
		const body = fence(
			JSON.stringify({
				entries: [
					{
						name: 'Group',
						startTime: '2025-01-01T09:00:00.000Z',
						endTime: '2025-01-01T10:00:00.000Z',
						subEntries: [
							{
								startTime: '2025-01-01T10:00:00.000Z',
								endTime: '2025-01-01T10:15:00.000Z',
								subEntries: null,
							},
							{
								name: 'Subgroup',
								startTime: null,
								endTime: null,
								subEntries: [
									{
										startTime: '2025-01-01T10:15:00.000Z',
										endTime: '2025-01-01T10:30:00.000Z',
										subEntries: null,
									},
								],
							},
						],
					},
				],
			}),
		);

		expect(sumWorkHours(body, { now })).toMatchObject({
			// 15m + 15m of children; the group's own hour is ignored.
			hours: 0.5,
			blocks: 1,
		});
	});

	it('ignores entries that never started and negative durations', () => {
		const body = fence(
			JSON.stringify({
				entries: [
					{ startTime: null, endTime: null, subEntries: null },
					{
						startTime: '2025-01-01T12:00:00.000Z',
						endTime: '2025-01-01T11:00:00.000Z',
						subEntries: null,
					},
				],
			}),
		);

		expect(sumTimekeepBlocks(extractTimekeepBlocks(body), now).ms).toBe(0);
	});

	it('returns zero for an empty note', () => {
		expect(sumWorkHours('', { now })).toEqual({
			ms: 0,
			hours: 0,
			openEntries: 0,
			blocks: 0,
		});
	});
});

describe('TimekeepCache', () => {
	it('reuses parsed blocks until the mtime changes', () => {
		const cache = new TimekeepCache();

		expect(cache.summarize('note.md', 1, closed, { now }).hours).toBe(1.5);
		expect(cache.summarize('note.md', 1, '', { now }).hours).toBe(1.5);
		expect(cache.summarize('note.md', 2, '', { now }).hours).toBe(0);
	});

	it('forgets a path', () => {
		const cache = new TimekeepCache();
		cache.summarize('note.md', 1, closed, { now });

		cache.forget('note.md');

		expect(cache.summarize('note.md', 1, '', { now }).blocks).toBe(0);
	});
});

describe('Timekeep API', () => {
	function fakeApi(ms: number): TimekeepApi {
		return {
			parser: {
				extractTimekeepCodeblocks: () => [{ entries: [] }],
			},
			queries: {
				getTotalDuration: () => ms,
			},
		};
	}

	it('finds the API through the plugin registry', () => {
		const api = fakeApi(1);

		expect(findTimekeepApi({ plugins: { timekeep: { api } } })).toBe(api);
		expect(findTimekeepApi({ plugins: {} })).toBeNull();
		expect(findTimekeepApi(null)).toBeNull();
	});

	it('prefers the API total when the current time is supplied', () => {
		const result = sumWorkHours(closed, {
			now,
			api: fakeApi(7_200_000),
			currentTime: {},
		});

		expect(result).toMatchObject({
			ms: 7_200_000,
			hours: 2,
			blocks: 1,
		});
	});

	it('falls back to its own parser when the API fails', () => {
		const api: TimekeepApi = {
			parser: {
				extractTimekeepCodeblocks: () => {
					throw new Error('offline');
				},
			},
			queries: { getTotalDuration: () => 0 },
		};

		expect(
			sumWorkHours(closed, { now, api, currentTime: {} }),
		).toMatchObject({ hours: 1.5 });
	});

	it('does not need Timekeep to be installed', () => {
		expect(findTimekeepApi({ plugins: {} })).toBeNull();
		expect(sumWorkHours(closed, { now }).hours).toBe(1.5);
	});
});
