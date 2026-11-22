import { describe, expect, it } from 'vitest';
import { formatDate, renderFilename, renderTokens } from './render';

// Sunday, 22 November 2026, 09:05:07, in the machine's local time zone.
const NOW = new Date(2026, 10, 22, 9, 5, 7);

const VALUES = {
	title: 'Learn Python',
	goal: '[[Learn Python]]',
	goalName: 'Learn Python',
	category: 'Learning',
	author: 'Aaqil',
	subtitle: 'Basics first',
	status: 'Todo',
};

describe('renderTokens', () => {
	it('replaces every plain token', () => {
		expect(
			renderTokens(
				'{{title}} / {{goal}} / {{goal_name}} / {{category}} / {{author}} / {{subtitle}} / {{status}}',
				VALUES,
				NOW,
			),
		).toBe(
			'Learn Python / [[Learn Python]] / Learn Python / Learning / Aaqil / Basics first / Todo',
		);
	});

	it('ignores token case and surrounding spaces', () => {
		expect(renderTokens('{{ TITLE }} and {{Goal_Name}}', VALUES, NOW)).toBe(
			'Learn Python and Learn Python',
		);
	});

	it('renders an empty string for a value that was not supplied', () => {
		expect(renderTokens('[{{category}}]', { title: 'Untitled' }, NOW)).toBe(
			'[]',
		);
	});

	it('preserves unknown tokens as written', () => {
		expect(renderTokens('{{unknown}} {{nested {{title}} }}', VALUES, NOW)).toBe(
			'{{unknown}} {{nested Learn Python }}',
		);
	});

	it('renders the default date, time, and created tokens', () => {
		expect(renderTokens('{{date}} {{time}} {{created}}', VALUES, NOW)).toBe(
			'2026-11-22 09:05 2026-11-22 09:05',
		);
	});

	it('renders a format after the colon', () => {
		expect(
			renderTokens(
				'{{date:dddd, D MMMM YYYY}} at {{time:hh:mm A}}',
				VALUES,
				NOW,
			),
		).toBe('Sunday, 22 November 2026 at 09:05 AM');
	});
});

describe('formatDate', () => {
	it('formats the tokens a filename needs', () => {
		expect(formatDate(NOW, 'YYYY-MM-DD')).toBe('2026-11-22');
		expect(formatDate(NOW, 'YY M D')).toBe('26 11 22');
		expect(formatDate(NOW, 'dddd, D MMMM YYYY')).toBe(
			'Sunday, 22 November 2026',
		);
		expect(formatDate(NOW, 'ddd MMM')).toBe('Sun Nov');
	});

	it('formats hours in both clocks', () => {
		expect(formatDate(NOW, 'HH:mm:ss')).toBe('09:05:07');
		expect(formatDate(NOW, 'H:m:s')).toBe('9:5:7');
		expect(formatDate(NOW, 'hh:mm A')).toBe('09:05 AM');
		expect(formatDate(NOW, 'h:m a')).toBe('9:5 am');
		expect(formatDate(new Date(2026, 10, 22, 15, 0, 0), 'h A')).toBe(
			'3 PM',
		);
		expect(formatDate(new Date(2026, 10, 22, 0, 0, 0), 'hh A')).toBe(
			'12 AM',
		);
	});

	it('copies bracketed text and unknown tokens through', () => {
		expect(formatDate(NOW, '[Week of] YYYY')).toBe('Week of 2026');
		expect(formatDate(NOW, 'YYYY QX')).toBe('2026 QX');
	});

	it('writes ordinals for Do', () => {
		expect(formatDate(NOW, 'Do MMMM')).toBe('22nd November');
		expect(formatDate(new Date(2026, 10, 1), 'Do')).toBe('1st');
		expect(formatDate(new Date(2026, 10, 3), 'Do')).toBe('3rd');
		expect(formatDate(new Date(2026, 10, 11), 'Do')).toBe('11th');
	});
});

describe('renderFilename', () => {
	it('renders the same tokens into a filename pattern', () => {
		expect(
			renderFilename('{{date:YYYY-MM-DD}} - {{title}}', VALUES, NOW),
		).toBe('2026-11-22 - Learn Python');
	});
});
