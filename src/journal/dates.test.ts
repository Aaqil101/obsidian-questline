import { describe, expect, it } from 'vitest';
import { isoDate, journalDate } from './dates';

describe('isoDate', () => {
	it('uses a local YYYY-MM-DD date', () => {
		expect(isoDate(new Date(2026, 10, 27, 23, 30))).toBe('2026-11-27');
		expect(isoDate(new Date(2026, 0, 2, 1, 0))).toBe('2026-01-02');
	});
});

describe('journalDate', () => {
	const journal = {
		names: new Set(['2026-11-01', '2026-11-15']),
		today: '2026-11-27',
	};

	it('stays plain without a journal folder', () => {
		expect(journalDate('2026-11-01', undefined)).toBe('2026-11-01');
	});

	it('links a date whose note exists', () => {
		expect(journalDate('2026-11-01', journal)).toBe('[[2026-11-01]]');
	});

	it('links today and later even before the note exists', () => {
		expect(journalDate('2026-11-27', journal)).toBe('[[2026-11-27]]');
		expect(journalDate('2026-12-01', journal)).toBe('[[2026-12-01]]');
	});

	it('leaves earlier dates without a note plain', () => {
		expect(journalDate('2026-11-02', journal)).toBe('2026-11-02');
	});
});
