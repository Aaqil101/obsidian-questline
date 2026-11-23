import { describe, expect, it } from 'vitest';
import { validateGoal } from './validate';

const VALID = {
	title: 'Learn Python',
	category: 'Learning',
	reason: 'Automate the boring parts',
	timespan: '6 Months',
};

describe('validateGoal', () => {
	it('accepts a complete goal', () => {
		expect(validateGoal(VALID)).toBeNull();
	});

	it('requires a title', () => {
		expect(validateGoal({ ...VALID, title: ' ' })?.field).toBe('title');
	});

	it('requires a category', () => {
		expect(validateGoal({ ...VALID, category: ' ' })?.field).toBe(
			'category',
		);
	});

	it('requires a reason', () => {
		expect(validateGoal({ ...VALID, reason: ' ' })?.field).toBe('reason');
	});

	it('requires a timespan', () => {
		expect(validateGoal({ ...VALID, timespan: ' ' })?.field).toBe(
			'timespan',
		);
	});

	it('rejects a timespan it cannot read', () => {
		const problem = validateGoal({ ...VALID, timespan: 'someday' });

		expect(problem?.field).toBe('timespan');
		expect(problem?.message).toContain('6 Months');
	});

	it('accepts an infinite timespan', () => {
		expect(validateGoal({ ...VALID, timespan: 'Infinite' })).toBeNull();
	});
});
