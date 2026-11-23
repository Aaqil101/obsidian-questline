import { describe, expect, it } from 'vitest';
import { goalTitle, withoutDate } from './names';

describe('withoutDate', () => {
	it('removes the default goal date prefix', () => {
		expect(withoutDate('2026-11-23 - Goal B')).toBe('Goal B');
		expect(withoutDate('2026-11-23 | Goal B')).toBe('Goal B');
	});

	it('leaves a name without a date alone', () => {
		expect(withoutDate('Goal B')).toBe('Goal B');
	});

	it('keeps a name that is only a date', () => {
		expect(withoutDate('2026-11-23')).toBe('2026-11-23');
	});
});

describe('goalTitle', () => {
	it('prefers the first alias', () => {
		expect(goalTitle('2026-11-23 - Goal B', ['Goal B'])).toBe('Goal B');
	});

	it('falls back to the date-stripped name', () => {
		expect(goalTitle('2026-11-23 - Goal B')).toBe('Goal B');
	});
});
