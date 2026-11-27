import { describe, expect, it } from 'vitest';
import {
	findFrontmatterKey,
	removeFrontmatterKey,
	setFrontmatterKey,
} from './frontmatter';

describe('findFrontmatterKey', () => {
	it('finds a key whatever its casing', () => {
		const frontmatter = { Project_Template: '[[Template]]' };

		expect(findFrontmatterKey(frontmatter, 'project_template')).toBe(
			'Project_Template',
		);
		expect(findFrontmatterKey(frontmatter, 'status')).toBeUndefined();
	});
});

describe('setFrontmatterKey', () => {
	it('adds a key when it is missing', () => {
		const frontmatter: Record<string, unknown> = { tags: ['goal'] };

		setFrontmatterKey(frontmatter, 'project_template', '[[Template]]');

		expect(frontmatter).toEqual({
			tags: ['goal'],
			project_template: '[[Template]]',
		});
	});

	it('replaces a differently cased key instead of duplicating it', () => {
		const frontmatter: Record<string, unknown> = {
			Project_Template: '[[Old]]',
			status: 'Todo',
		};

		setFrontmatterKey(frontmatter, 'project_template', '[[New]]');

		expect(frontmatter).toEqual({
			status: 'Todo',
			project_template: '[[New]]',
		});
	});
});

describe('removeFrontmatterKey', () => {
	it('removes a key whatever its casing', () => {
		const frontmatter: Record<string, unknown> = {
			PROJECT_TEMPLATE: '[[Template]]',
			tags: ['goal'],
		};

		removeFrontmatterKey(frontmatter, 'project_template');

		expect(frontmatter).toEqual({ tags: ['goal'] });
	});

	it('does nothing when the key is absent', () => {
		const frontmatter: Record<string, unknown> = { tags: ['goal'] };

		removeFrontmatterKey(frontmatter, 'project_template');

		expect(frontmatter).toEqual({ tags: ['goal'] });
	});
});
