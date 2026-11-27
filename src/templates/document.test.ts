import { describe, expect, it } from 'vitest';
import {
	BUILTIN_AUTHOR,
	BUILTIN_GOAL,
	BUILTIN_PROJECT,
	STARTER_TEMPLATES,
	type StarterTemplate,
} from './builtin';
import { composeNote, mergeFrontmatter, splitFrontmatter } from './document';

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

const CORE = {
	tags: ['goal'],
	created: '2026-11-22',
	category: 'Learning',
	timespan: '6 Months',
};

function starter(name: string): StarterTemplate {
	const found = STARTER_TEMPLATES.find((item) => item.fileName === name);
	if (!found) throw new Error(`Missing starter template: ${name}`);

	return found;
}

describe('splitFrontmatter', () => {
	it('splits frontmatter from the body with either line ending', () => {
		expect(splitFrontmatter('---\ntype: note\n---\nBody')).toEqual({
			frontmatter: 'type: note',
			body: 'Body',
		});
		expect(splitFrontmatter('---\r\ntype: note\r\n---\r\n\r\nBody')).toEqual({
			frontmatter: 'type: note',
			body: '\r\nBody',
		});
	});

	it('treats an empty block as frontmatter', () => {
		expect(splitFrontmatter('---\n---\nBody')).toEqual({
			frontmatter: '',
			body: 'Body',
		});
	});

	it('treats a note without a closed block as all body', () => {
		expect(splitFrontmatter('# Title')).toEqual({
			frontmatter: null,
			body: '# Title',
		});
		expect(splitFrontmatter('---\nunclosed')).toEqual({
			frontmatter: null,
			body: '---\nunclosed',
		});
	});
});

describe('mergeFrontmatter', () => {
	it('keeps template keys that creation does not own', () => {
		expect(
			mergeFrontmatter(
				{ tags: ['goal'], created: '2026-11-22' },
				{ subtitle: 'Basics', cssclasses: ['wide'] },
			),
		).toEqual({
			subtitle: 'Basics',
			cssclasses: ['wide'],
			tags: ['goal'],
			created: '2026-11-22',
		});
	});

	it('lets core win, ignoring key case', () => {
		expect(
			mergeFrontmatter({ status: 'Todo' }, { Status: 'Done', author: 'Them' }),
		).toEqual({ author: 'Them', status: 'Todo' });
	});

	it('unions tags and drops the template marker', () => {
		expect(
			mergeFrontmatter(
				{ tags: ['goal'] },
				{ tags: 'area/learning', type: 'questline-template' },
			),
		).toEqual({ tags: ['goal', 'area/learning'] });
	});

	it('keeps a type that is not the template marker', () => {
		expect(mergeFrontmatter({}, { type: 'knowledge' })).toEqual({
			type: 'knowledge',
		});
	});
});

describe('composeNote', () => {
	it('uses the built-in body when no template is configured', () => {
		const parts = composeNote({
			template: null,
			fallback: BUILTIN_GOAL,
			core: CORE,
			values: VALUES,
			now: NOW,
		});

		expect(parts.body).toBe(BUILTIN_GOAL.body.trim());
		expect(parts.frontmatter).toEqual(CORE);
	});

	it('renders tokens in the template body and frontmatter', () => {
		const parts = composeNote({
			template: {
				frontmatter: {
					aliases: ['{{title}}'],
					subtitle: '{{status}}',
					created: '1999-01-01',
				},
				body: '# {{title}}\n\nPart of {{goal}}.',
			},
			fallback: BUILTIN_GOAL,
			core: CORE,
			values: VALUES,
			now: NOW,
		});

		expect(parts.body).toBe('# Learn Python\n\nPart of [[Learn Python]].');
		expect(parts.frontmatter).toEqual({
			aliases: ['Learn Python'],
			subtitle: 'Todo',
			...CORE,
		});
	});

	it('leaves a deliberately blank template blank', () => {
		const parts = composeNote({
			template: { frontmatter: null, body: '  \n' },
			fallback: BUILTIN_PROJECT,
			core: CORE,
			values: VALUES,
			now: NOW,
		});

		expect(parts.body).toBe('');
	});

	it('never copies the template marker into a new note', () => {
		const parts = composeNote({
			template: starter('Goal template').document,
			fallback: BUILTIN_GOAL,
			core: CORE,
			values: VALUES,
			now: NOW,
		});

		expect(parts.frontmatter.type).toBeUndefined();
		expect(parts.body).toContain('## What does success look like?');
	});
});

describe('starter templates', () => {
	it('ships one editable goal, project, and author template', () => {
		expect(STARTER_TEMPLATES.map((item) => item.fileName)).toEqual([
			'Goal template',
			'Project template',
			'Author template',
		]);
		expect(STARTER_TEMPLATES.map((item) => item.setting)).toEqual([
			'goalTemplate',
			'projectTemplate',
			'authorTemplate',
		]);

		for (const item of STARTER_TEMPLATES) {
			expect(item.document.frontmatter?.type).toBe('questline-template');
			expect(item.document.body).toContain('copied into every new');
		}
	});

	it('starts from the built-in body', () => {
		expect(starter('Goal template').document.body).toContain(
			BUILTIN_GOAL.body.trim(),
		);
		expect(starter('Project template').document.body).toContain(
			BUILTIN_PROJECT.body.trim(),
		);
		expect(starter('Author template').document.body).toContain(
			BUILTIN_AUTHOR.body.trim(),
		);
		expect(starter('Project template').document.body).toContain(
			'## Project info',
		);
		expect(starter('Project template').document.body).toContain(
			'```project-progress',
		);
		expect(starter('Project template').document.body).toContain(
			'```timekeep',
		);
	});
});
