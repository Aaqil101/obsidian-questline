import { describe, expect, it } from 'vitest';
import { removeFrontmatterKey, setFrontmatterKey } from './frontmatter';

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
