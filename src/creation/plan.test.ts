import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../settings/types';
import type { QuestlineConfig } from '../settings/types';
import { BUILTIN_GOAL } from '../templates/builtin';
import {
	allocatePath,
	noteLink,
	planGoal,
	planProject,
	sanitizeName,
	type PlanContext,
	type ProjectDraft,
} from './plan';

const NOW = new Date(2026, 10, 22, 9, 5, 7);

const CONFIG: QuestlineConfig = {
	...DEFAULT_CONFIG,
	goalFolder: 'goals',
	projectFolder: 'projects',
	templateFolder: 'templates',
	projectStatuses: ['Todo', 'In Progress'],
};

function context(paths: readonly string[] = []): PlanContext {
	const taken = new Set(paths.map((path) => path.toLowerCase()));

	return {
		config: CONFIG,
		now: NOW,
		exists: (path) => taken.has(path.toLowerCase()),
	};
}

function projectDraft(patch: Partial<ProjectDraft> = {}): ProjectDraft {
	return {
		title: 'Ship the site',
		goal: null,
		status: '',
		author: '',
		subtitle: '',
		template: '',
		folder: 'projects',
		...patch,
	};
}

describe('sanitizeName', () => {
	it('turns invalid link characters into single spaces', () => {
		expect(sanitizeName('Learn: Python / Fast')).toBe('Learn Python Fast');
		expect(sanitizeName('A  *  B')).toBe('A B');
		expect(sanitizeName('a#b^c[d]e|f')).toBe('a b c d e f');
	});

	it('never starts or ends with a dot and drops the extension', () => {
		expect(sanitizeName('...Hidden...')).toBe('Hidden');
		expect(sanitizeName('Note.md')).toBe('Note');
	});
});

describe('allocatePath', () => {
	it('adds a numeric suffix until the name is free', () => {
		const taken = new Set([
			'goals/Plan.md',
			'goals/Plan 2.md',
			'goals/Plan 3.md',
		]);

		expect(allocatePath('goals', 'Plan', (path) => taken.has(path))).toBe(
			'goals/Plan 4.md',
		);
		expect(allocatePath('', 'Plan', () => false)).toBe('Plan.md');
	});
});

describe('planGoal', () => {
	it('creates and links a custom project template', () => {
		const plan = planGoal(
			{
				title: 'Learn: Python',
				category: 'Learning',
				reason: 'Automate the boring parts',
				timespan: '6 Months',
				folder: 'goals',
				template: 'custom',
				templatePath: '',
			},
			context(),
			{ goal: null, project: null },
		);

		expect(plan.template?.path).toBe(
			'templates/Learn Python project template.md',
		);
		expect(plan.path).toBe('goals/2026-11-22 - Learn Python.md');
		expect(plan.note.frontmatter).toMatchObject({
			tags: ['goal'],
			created: '2026-11-22',
			aliases: ['Learn Python'],
			category: 'Learning',
			reason: 'Automate the boring parts',
			timespan: '6 Months',
			project_template: '[[templates/Learn Python project template]]',
		});
		expect(plan.note.body).toBe(BUILTIN_GOAL.body.trim());
		expect(plan.template?.parts.frontmatter).toEqual({
			type: 'questline-template',
		});
		expect(plan.template?.parts.body).toContain('# {{title}}');
	});

	it('uses the global project template to seed a custom one', () => {
		const plan = planGoal(
			{
				title: 'Learn Python',
				category: '',
				reason: '',
				timespan: '',
				folder: 'goals',
				template: 'custom',
				templatePath: '',
			},
			context(),
			{
				goal: null,
				project: {
					frontmatter: { cssclasses: ['wide'], type: 'note' },
					body: '# {{title}} from the global template',
				},
			},
		);

		expect(plan.template?.parts.frontmatter).toEqual({
			cssclasses: ['wide'],
			type: 'questline-template',
		});
		expect(plan.template?.parts.body).toContain(
			'from the global template',
		);
	});

	it('leaves the template alone in global mode', () => {
		const plan = planGoal(
			{
				title: 'Learn Python',
				category: '',
				reason: '',
				timespan: '',
				folder: 'goals',
				template: 'global',
				templatePath: '',
			},
			context(),
			{ goal: null, project: null },
		);

		expect(plan.template).toBeNull();
		expect(plan.note.frontmatter.aliases).toEqual(['Learn Python']);
		expect(plan.note.frontmatter.project_template).toBeUndefined();
	});

	it('reserves the template name and avoids filename collisions', () => {
		const plan = planGoal(
			{
				title: 'Collision',
				category: '',
				reason: '',
				timespan: '',
				folder: 'goals',
				template: 'custom',
				templatePath: '',
			},
			context(['goals/2026-11-22 - Collision.md']),
			{ goal: null, project: null },
		);

		expect(plan.requestedPath).toBe(
			'goals/2026-11-22 - Collision.md',
		);
		expect(plan.path).toBe('goals/2026-11-22 - Collision 2.md');
	});

	it('links an existing template without creating one', () => {
		const plan = planGoal(
			{
				title: 'Learn Python',
				category: '',
				reason: '',
				timespan: '',
				folder: 'goals',
				template: 'existing',
				templatePath: 'templates/Shared project template.md',
			},
			context(['templates/Shared project template.md']),
			{ goal: null, project: null },
		);

		expect(plan.template).toBeNull();
		expect(plan.note.frontmatter.project_template).toBe(
			'[[templates/Shared project template]]',
		);
	});

	it('refuses an existing mode with no template path', () => {
		expect(() =>
			planGoal(
				{
					title: 'Learn Python',
					category: '',
					reason: '',
					timespan: '',
					folder: 'goals',
					template: 'existing',
					templatePath: '',
				},
				context(),
				{ goal: null, project: null },
			),
		).toThrow('Choose an existing template note first.');
	});
});

describe('planProject', () => {
	it('links a goal, writes core fields, and renders the template', () => {
		const plan = planProject(
			projectDraft({
				title: 'Ship: the site',
				goal: {
					path: 'goals/Learn Python.md',
					name: 'Learn Python',
					display: 'Python',
				},
				status: 'In Progress',
				author: 'Aaqil',
				subtitle: 'Ship it',
			}),
			context(),
			{
				template: {
					frontmatter: { aliases: ['{{title}}'] },
					body: '# {{title}}\n\nGoal: {{goal}}\nOwner: {{author}}',
				},
			},
		);

		expect(plan.path).toBe('projects/Python - Ship the site.md');
		expect(plan.note.frontmatter).toMatchObject({
			tags: ['project'],
			created: '2026-11-22',
			status: 'In Progress',
			author: 'Aaqil',
			subtitle: 'Ship it',
			goal: '[[goals/Learn Python|Python]]',
			aliases: ['Ship the site'],
		});
		expect(plan.note.body).toBe(
			'# Ship: the site\n\nGoal: [[goals/Learn Python|Python]]\nOwner: Aaqil',
		);
	});

	it('keeps a standalone project unassigned and defaults the status', () => {
		const plan = planProject(projectDraft(), context(), { template: null });

		expect(plan.path).toBe('projects/Ship the site.md');
		expect(plan.note.frontmatter).toMatchObject({
			tags: ['project'],
			status: 'Todo',
			aliases: ['Ship the site'],
		});
		expect(plan.note.frontmatter.goal).toBeUndefined();
		expect(plan.note.frontmatter.author).toBeUndefined();
	});

	it('drops the goal date when the goal has no alias', () => {
		const plan = planProject(
			projectDraft({
				title: 'ts',
				goal: {
					path: 'goals/2026-11-23 - Goal B.md',
					name: '2026-11-23 - Goal B',
				},
			}),
			context(),
			{ template: null },
		);

		expect(plan.path).toBe('projects/Goal B - ts.md');
		expect(plan.note.frontmatter.goal).toBe(
			'[[goals/2026-11-23 - Goal B|Goal B]]',
		);
	});
});

describe('noteLink', () => {
	it('uses the alias as display text', () => {
		expect(
			noteLink({
				path: 'goals/Learn.md',
				name: 'Learn',
				display: 'Python',
			}),
		).toBe('[[goals/Learn|Python]]');
		expect(noteLink({ path: 'goals/Learn.md', name: 'Learn' })).toBe(
			'[[goals/Learn|Learn]]',
		);
	});

	it('drops a leading date from the display text', () => {
		expect(
			noteLink({
				path: 'goals/2026-11-23 - Goal B.md',
				name: '2026-11-23 - Goal B',
			}),
		).toBe('[[goals/2026-11-23 - Goal B|Goal B]]');
	});
});
