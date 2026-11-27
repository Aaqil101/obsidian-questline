import { describe, expect, it } from 'vitest';
import {
	validateGoal,
	validateGoalEdit,
	validateProjectEdit,
} from './validate';

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

describe('validateGoalEdit', () => {
	it('requires a title', () => {
		expect(validateGoalEdit({ title: ' ', timespan: '' })?.field).toBe(
			'title',
		);
	});

	it('allows an empty timespan and category', () => {
		expect(validateGoalEdit({ title: 'Learn', timespan: '' })).toBeNull();
	});

	it('rejects a timespan it cannot read', () => {
		expect(
			validateGoalEdit({ title: 'Learn', timespan: 'someday' })?.field,
		).toBe('timespan');
	});
});

describe('validateProjectEdit', () => {
	it('requires a title and a status', () => {
		expect(
			validateProjectEdit({ title: ' ', status: 'Todo' })?.field,
		).toBe('title');
		expect(
			validateProjectEdit({ title: 'Site', status: ' ' })?.field,
		).toBe('status');
	});

	it('accepts a complete project', () => {
		expect(
			validateProjectEdit({ title: 'Site', status: 'Todo' }),
		).toBeNull();
	});
});
