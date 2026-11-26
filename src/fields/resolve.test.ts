import { describe, expect, it } from 'vitest';
import { resolveNote } from './resolve';
import { parseLink } from './wikilink';

const legacyProjectBody = [
	'%%',
	'Goal:: [[2025-01-29 - Learn Python|Learn Python]]',
	"Bar:: `$= dv.view('total-progress-bar', {file: '; Folio'})`",
	'tags:: #project, [[Python]], [[Programming]]',
	'date:: [[2026-06-09]]',
	'%%',
].join('\n');

const legacyGoalBody = [
	'%%',
	"Progress:: `$= dv.view('progress', {file: '2025-01-29 - Learn Python'})`",
	"Target:: `$= dv.view('target', {file: '2025-01-29 - Learn Python'})`",
	"Bar:: `$= dv.view('total-progress-bar', {file: '2025-01-29 - Learn Python'})`",
	"Projects:: `$= const projects = dv.page('2025-01-29 - Learn Python').file.inlinks`",
	'%%',
].join('\n');

describe('resolveNote', () => {
	it('resolves a goal from frontmatter', () => {
		const fields = resolveNote({
			path: '00 - P&Q/Goals/2025-01-29 - Learn Python.md',
			frontmatter: {
				tags: 'goal',
				created: '2025-01-29 20:10:41',
				aliases: 'Learn Python',
				status: 'Professional',
				Reason: 'I want to learn Python so that I can do cool stuff with it.',
				Timespan: '?Infinite',
			},
			body: legacyGoalBody,
		});

		expect(fields.isGoal).toBe(true);
		expect(fields.isProject).toBe(false);
		expect(fields.category).toBe('Professional');
		expect(fields.status).toBe('Professional');
		expect(fields.reason).toContain('learn Python');
		expect(fields.timespan).toBe('?Infinite');
		expect(fields.aliases).toEqual(['Learn Python']);
		expect(fields.created).toBe('2025-01-29 20:10:41');
		expect(fields.goals).toEqual([]);
	});

	it('prefers category over the legacy status for goals', () => {
		const fields = resolveNote({
			path: 'goal.md',
			frontmatter: { tags: 'goal', category: 'Knowledge', status: 'Professional' },
			body: '',
		});

		expect(fields.category).toBe('Knowledge');
		expect(fields.status).toBe('Professional');
	});

	it('resolves a legacy project with an inline goal link', () => {
		const fields = resolveNote({
			path: '00 - P&Q/Projects/Folio/; Folio.md',
			frontmatter: {
				authors: ['[[Aaqil]]', '[[Shabry]]'],
				aliases: 'Folio',
				status: 'Completed',
				subtitle: 'Turn any PDF into a print-ready booklet.',
				Class: 'Project Class',
			},
			body: legacyProjectBody,
		});

		expect(fields.isProject).toBe(true);
		expect(fields.isGoal).toBe(false);
		expect(fields.hasProjectMarker).toBe(true);
		expect(fields.projectClass).toBe('Project Class');
		expect(fields.status).toBe('Completed');
		expect(fields.category).toBeNull();
		expect(fields.subtitle).toContain('print-ready booklet');
		expect(fields.authors).toEqual(['Aaqil', 'Shabry']);
		expect(fields.goals).toEqual([
			{
				target: '2025-01-29 - Learn Python',
				display: 'Learn Python',
				heading: null,
			},
		]);
	});

	it('resolves multiple goal links from frontmatter and inline values', () => {
		const frontmatter = resolveNote({
			path: 'project.md',
			frontmatter: {
				tags: 'project',
				status: 'In Progress',
				goal: ['[[A]]', '[[B|Second]]'],
			},
			body: 'Goal:: [[Ignored]]',
		});
		const inline = resolveNote({
			path: 'project.md',
			frontmatter: { tags: 'project', status: 'In Progress' },
			body: 'Goal:: [[A]], [[B|Second]], [[C#Part]]',
		});

		expect(frontmatter.goals.map((link) => link.target)).toEqual(['A', 'B']);
		expect(frontmatter.goals[1]?.display).toBe('Second');
		expect(inline.goals.map((link) => link.target)).toEqual([
			'A',
			'B',
			'C',
		]);
		expect(inline.goals[2]?.heading).toBe('Part');
	});

	it('reads a project tag from an inline tags field and the marker from Class', () => {
		const fields = resolveNote({
			path: 'project.md',
			frontmatter: { Class: 'Project Class' },
			body: ['%%', 'tags:: #project, [[Python]]', '%%'].join('\n'),
		});

		expect(fields.isProject).toBe(true);
		expect(fields.tags).toEqual(['project']);
		expect(fields.hasProjectMarker).toBe(true);
		expect(fields.status).toBeNull();
	});

	it('does not treat a bare tag without a status or class as a project', () => {
		const fields = resolveNote({
			path: 'walkthrough.md',
			frontmatter: { tags: ['project'] },
			body: ['%%', 'tags:: #project, [[; Folio|Folio]]', '%%'].join('\n'),
		});

		expect(fields.isProject).toBe(true);
		expect(fields.hasProjectMarker).toBe(false);
	});

	it('finds inline #goal and #project hashtags in the body', () => {
		const fields = resolveNote({
			path: 'note.md',
			frontmatter: null,
			body: 'This note feeds #goal and belongs to #project.',
		});

		expect(fields.tags).toEqual(['goal', 'project']);
		expect(fields.isGoal).toBe(true);
		expect(fields.isProject).toBe(true);
	});

	it('ignores hashtags inside code fences and inline code', () => {
		const fields = resolveNote({
			path: 'note.md',
			frontmatter: null,
			body: ['```', '#goal #project', '```', '`#goal`', '## Tasks'].join('\n'),
		});

		expect(fields.tags).toEqual([]);
		expect(fields.isGoal).toBe(false);
	});

	it('returns frontmatter values before inline fields', () => {
		const fields = resolveNote({
			path: 'project.md',
			frontmatter: { status: 'In Progress', reason: 'From frontmatter' },
			body: ['reason:: From inline', 'status:: Completed'].join('\n'),
		});

		expect(fields.status).toBe('In Progress');
		expect(fields.reason).toBe('From frontmatter');
	});

	it('falls back to inline fields when frontmatter is missing', () => {
		const fields = resolveNote({
			path: 'project.md',
			frontmatter: null,
			body: [
				'tags:: #project',
				'Goal:: [[2024-10-24 - Learn AutoHotkey v2|Learn AutoHotkey v2]]',
				'status:: Waiting',
				'subtitle:: A naming convention.',
			].join('\n'),
		});

		expect(fields.isProject).toBe(true);
		expect(fields.hasProjectMarker).toBe(true);
		expect(fields.status).toBe('Waiting');
		expect(fields.subtitle).toBe('A naming convention.');
		expect(fields.goals[0]?.target).toBe('2024-10-24 - Learn AutoHotkey v2');
	});

	it('ignores the legacy expression fields', () => {
		const fields = resolveNote({
			path: 'goal.md',
			frontmatter: { tags: 'goal' },
			body: legacyGoalBody,
		});

		expect(fields.progress).toBeNull();
		expect(fields.target).toBeNull();
		expect(fields.start).toBeNull();
		expect(fields).not.toHaveProperty('bar');
		expect(fields).not.toHaveProperty('projects');
		expect(fields.reason).toBeNull();
	});

	it('treats an expression in a resolved field as missing', () => {
		const fields = resolveNote({
			path: 'note.md',
			frontmatter: null,
			body: ['reason:: `$= dv.page("x").reason`'].join('\n'),
		});

		expect(fields.reason).toBeNull();
	});

	it('reads bracketed and parenthesised inline fields', () => {
		const fields = resolveNote({
			path: 'note.md',
			frontmatter: null,
			body: [
				'- [goal:: [[2026-10-10 - HomeLab|HomeLab]]]',
				'Some text (timespan:: 6 Months) after it.',
			].join('\n'),
		});

		expect(fields.goals[0]?.target).toBe('2026-10-10 - HomeLab');
		expect(fields.goals[0]?.display).toBe('HomeLab');
		expect(fields.timespan).toBe('6 Months');
	});

	it('normalizes array and scalar tags the same way', () => {
		const fields = resolveNote({
			path: 'note.md',
			frontmatter: { tags: ['Goal', '#Project'] },
			body: '',
		});

		expect(fields.tags).toEqual(['goal', 'project']);
		expect(fields.isGoal).toBe(true);
		expect(fields.isProject).toBe(true);
	});

	it('uses configured goal and project tags', () => {
		const custom = resolveNote(
			{
				path: 'note.md',
				frontmatter: { tags: ['#Outcome', 'effort'], status: 'In Progress' },
				body: '',
			},
			{ goalTag: '#Outcome', projectTag: 'Effort' },
		);

		expect(custom.isGoal).toBe(true);
		expect(custom.isProject).toBe(true);

		const defaults = resolveNote({
			path: 'note.md',
			frontmatter: { tags: ['outcome', 'effort'] },
			body: '',
		});

		expect(defaults.isGoal).toBe(false);
		expect(defaults.isProject).toBe(false);
	});

	it('unwraps the project template link', () => {
		const fields = resolveNote({
			path: 'note.md',
			frontmatter: { project_template: '[[Templates/Project]]' },
			body: '',
		});

		expect(fields.projectTemplate).toBe('Templates/Project');
	});

	it('reads the note type so templates can be excluded', () => {
		const fields = resolveNote({
			path: 'templates/project.md',
			frontmatter: { tags: 'project', type: 'questline-template' },
			body: '',
		});

		expect(fields.noteType).toBe('questline-template');
	});

	it('reads manual progress numbers and ignores expressions', () => {
		const manual = resolveNote({
			path: 'goal.md',
			frontmatter: { tags: 'goal', progress: 40, target: 100, start: 10 },
			body: '',
		});
		const legacy = resolveNote({
			path: 'legacy.md',
			frontmatter: { tags: 'goal' },
			body: [
				'Progress:: `$= dv.view("progress")`',
				'Target:: `$= dv.view("target")`',
				'Start:: `$= dv.view("start")`',
			].join('\n'),
		});

		expect(manual.progress).toBe(40);
		expect(manual.target).toBe(100);
		expect(manual.start).toBe(10);
		expect(legacy.progress).toBeNull();
		expect(legacy.target).toBeNull();
		expect(legacy.start).toBeNull();
	});

	it('handles a missing frontmatter block and empty body without throwing', () => {
		const fields = resolveNote({ path: 'empty.md', frontmatter: null, body: '' });

		expect(fields).toMatchObject({
			path: 'empty.md',
			tags: [],
			isGoal: false,
			isProject: false,
			hasProjectMarker: false,
			category: null,
			status: null,
			goals: [],
			projectTemplate: null,
			timespan: null,
			reason: null,
			authors: [],
			subtitle: null,
			projectClass: null,
			created: null,
			aliases: [],
		});
	});
});

describe('parseLink', () => {
	it('unpacks the target, heading, and display text', () => {
		expect(parseLink('[[Notes/Goal#Milestones|Goal milestones]]')).toEqual({
			target: 'Notes/Goal',
			display: 'Goal milestones',
			heading: 'Milestones',
		});
	});

	it('takes plain text as a target', () => {
		expect(parseLink('Learn Python')).toEqual({
			target: 'Learn Python',
			display: null,
			heading: null,
		});
	});

	it('returns null for empty values', () => {
		expect(parseLink('   ')).toBeNull();
	});
});
