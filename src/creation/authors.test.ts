import { describe, expect, it } from 'vitest';
import {
	authorField,
	formatAuthor,
	mergeAuthors,
	parseAuthors,
} from './authors';

describe('formatAuthor', () => {
	it('returns plain names or wikilinks', () => {
		expect(formatAuthor('Aaqil', false)).toBe('Aaqil');
		expect(formatAuthor('Aaqil', true)).toBe('[[Aaqil]]');
	});

	it('does not wrap an existing wikilink twice', () => {
		expect(formatAuthor('[[Aaqil|AA]]', true)).toBe('[[Aaqil]]');
	});
});

describe('authorField', () => {
	it('returns null, a string, or an array', () => {
		expect(authorField('', false)).toBeNull();
		expect(authorField('Aaqil', false)).toBe('Aaqil');
		expect(authorField('Aaqil, Sam', true)).toEqual([
			'[[Aaqil]]',
			'[[Sam]]',
		]);
	});
});

describe('mergeAuthors', () => {
	it('adds new names without changing existing casing', () => {
		expect(
			mergeAuthors(['Aaqil'], ['aaqil', 'Sam', 'SAM', ' ']),
		).toEqual(['Aaqil', 'Sam']);
	});
});

describe('parseAuthors', () => {
	it('splits, trims, and removes duplicates', () => {
		expect(parseAuthors(' Aaqil, sam, AAQIL, , ')).toEqual(['Aaqil', 'sam']);
	});
});
