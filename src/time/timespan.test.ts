import { describe, expect, it } from 'vitest';
import { parseDate, parseTimespan } from './timespan';

const created = '2025-01-29 20:10:41';
const now = new Date(2025, 0, 30, 12, 0, 0);

function due(raw: string, start = created): string | null {
	return parseTimespan(raw, { created: start, now }).dueDate;
}

describe('parseTimespan', () => {
	it('parses every legacy emoji value', () => {
		expect(due('📅🔟 Years')).toBe('2035-01-29');
		expect(due('📅5️⃣ Years')).toBe('2030-01-29');
		expect(due('📅3️⃣ Years')).toBe('2028-01-29');
		expect(due('📅1️⃣ Year')).toBe('2026-01-29');
		expect(due('📆6️⃣ Months')).toBe('2025-07-29');
		expect(due('📆1️⃣ Month')).toBe('2025-02-28');
		expect(due('⌛1️⃣ Week')).toBe('2025-02-05');
		expect(due('🕒1️⃣ Day')).toBe('2025-01-30');
	});

	it('treats an infinite timespan as valid without a due date', () => {
		expect(parseTimespan('♾Infinite', { created, now })).toEqual({
			raw: '♾Infinite',
			valid: true,
			infinite: true,
			kind: 'infinite',
			amount: null,
			dueDate: null,
			remainingDays: null,
			overdue: false,
		});
	});

	it('parses the shorthand forms', () => {
		expect(due('1y')).toBe('2026-01-29');
		expect(due('6m')).toBe('2025-07-29');
		expect(due('2w')).toBe('2025-02-12');
		expect(due('3d')).toBe('2025-02-01');
	});

	it('parses plain and long duration words', () => {
		expect(due('6 Months')).toBe('2025-07-29');
		expect(due('5 years')).toBe('2030-01-29');
	});

	it('uses an ISO date directly', () => {
		expect(due('2026-12-31')).toBe('2026-12-31');
	});

	it('reports remaining days and the overdue state', () => {
		expect(parseTimespan('3d', { created, now })).toMatchObject({
			dueDate: '2025-02-01',
			remainingDays: 2,
			overdue: false,
		});
		expect(parseTimespan('2025-01-01', { created, now })).toMatchObject({
			dueDate: '2025-01-01',
			remainingDays: -29,
			overdue: true,
		});
		expect(parseTimespan('🕒1️⃣ Day', { created, now })).toMatchObject({
			remainingDays: 0,
			overdue: false,
		});
	});

	it('clamps month and year arithmetic to the last day', () => {
		expect(due('1m', '2025-01-31')).toBe('2025-02-28');
		expect(due('1y', '2024-02-29')).toBe('2025-02-28');
	});

	it('accepts a Date instance or ISO timestamp for created', () => {
		expect(
			due('1d', new Date(2025, 0, 29, 20, 10, 41).toISOString()),
		).toBe('2025-01-30');
		expect(parseDate(new Date(2025, 0, 29, 20, 10, 41))).toBeInstanceOf(Date);
	});

	it('returns no due date when created is missing or invalid', () => {
		expect(parseTimespan('1y', { now })).toMatchObject({
			valid: true,
			dueDate: null,
			remainingDays: null,
			overdue: false,
		});
		expect(parseTimespan('1y', { created: 'not a date', now })).toMatchObject({
			valid: true,
			dueDate: null,
		});
	});

	it('returns an invalid result instead of throwing', () => {
		for (const value of [
			'',
			'   ',
			'someday',
			'📅 Years',
			'2025-13-40',
			null,
			undefined,
		]) {
			expect(parseTimespan(value, { created, now })).toMatchObject({
				valid: false,
				infinite: false,
				dueDate: null,
				remainingDays: null,
				overdue: false,
			});
		}
	});
});

describe('parseDate', () => {
	it('parses a date with and without a time', () => {
		const date = parseDate('2025-01-29 20:10:41');
		const day = parseDate('2025-01-29');

		expect(date?.getFullYear()).toBe(2025);
		expect(date?.getHours()).toBe(20);
		expect(day?.getHours()).toBe(0);
	});

	it('rejects impossible dates and junk', () => {
		expect(parseDate('2025-02-30')).toBeNull();
		expect(parseDate('29-01-2025')).toBeNull();
		expect(parseDate('')).toBeNull();
		expect(parseDate(null)).toBeNull();
	});
});
