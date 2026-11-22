import { describe, expect, it } from 'vitest';
import { resolveNote } from '../fields/resolve';
import { buildIndex, isIndexedProject, noteName, projectFolder } from './build';
import type { NoteSnapshot } from './types';

function note(
	path: string,
	frontmatter: Record<string, unknown> | null,
	body = '',
): NoteSnapshot {
	return {
		path,
		mtime: 0,
		fields: resolveNote({ path, frontmatter, body }),
		tasks: [],
		headings: [],
		body,
	};
}

function goal(path: string, aliases: string[] = []): NoteSnapshot {
	return note(path, { tags: 'goal', aliases });
}

function project(
	path: string,
	goalTarget: string | null,
	extra: Record<string, unknown> = {},
): NoteSnapshot {
	const body = goalTarget
		? [`Goal:: [[${goalTarget}]]`, 'tags:: #project'].join('\n')
		: 'tags:: #project';

	return note(path, { status: 'In Progress', ...extra }, body);
}

describe('buildIndex', () => {
	it('indexes goals by the goal tag', () => {
		const index = buildIndex([
			goal('00 - P&Q/Goals/Learn Python.md', ['Learn Python']),
			note('notes/unrelated.md', { tags: 'project' }),
		]);

		expect(index.goals).toHaveLength(1);
		expect(index.goals[0]).toMatchObject({
			path: '00 - P&Q/Goals/Learn Python.md',
			name: 'Learn Python',
			aliases: ['Learn Python'],
		});
		expect(index.projects).toEqual([]);
	});

	it('requires the project tag and a status or project class', () => {
		const index = buildIndex([
			note('tag-only.md', { tags: 'project' }),
			note('status-only.md', { status: 'In Progress' }),
			note('tag-and-status.md', { tags: 'project', status: 'In Progress' }),
			note('tag-and-class.md', { tags: 'project', Class: 'Project Class' }),
		]);

		expect(index.projects.map((node) => node.path)).toEqual([
			'tag-and-class.md',
			'tag-and-status.md',
		]);
	});

	it('treats a template as neither a goal nor a project', () => {
		const index = buildIndex([
			note('templates/goal.md', {
				tags: 'goal',
				type: 'questline-template',
			}),
			note('templates/project.md', {
				tags: 'project',
				status: 'In Progress',
				type: 'questline-template',
			}),
		]);

		expect(index.goals).toEqual([]);
		expect(index.projects).toEqual([]);
		expect(index.notes.size).toBe(0);
	});

	it('handles top-level and folder project notes', () => {
		const index = buildIndex([
			goal('00 - P&Q/Goals/Learn Python.md'),
			project('00 - P&Q/Projects/; Folio.md', 'Learn Python'),
			project('00 - P&Q/Projects/Folio/; Folio.md', 'Learn Python'),
			project('00 - P&Q/Projects/SeasonTrack/SeasonTrack.md', 'Learn Python'),
		]);

		const topLevel = index.projectByPath.get('00 - P&Q/Projects/; Folio.md');
		const folder = index.projectByPath.get('00 - P&Q/Projects/Folio/; Folio.md');
		const bare = index.projectByPath.get(
			'00 - P&Q/Projects/SeasonTrack/SeasonTrack.md',
		);

		expect(index.projects).toHaveLength(3);
		expect(topLevel).toMatchObject({
			name: 'Folio',
			folder: '00 - P&Q/Projects',
			folderProject: null,
		});
		expect(folder).toMatchObject({
			name: 'Folio',
			folder: '00 - P&Q/Projects/Folio',
			folderProject: '00 - P&Q/Projects/Folio',
		});
		expect(bare).toMatchObject({
			name: 'SeasonTrack',
			folder: '00 - P&Q/Projects/SeasonTrack',
			folderProject: '00 - P&Q/Projects/SeasonTrack',
		});
	});

	it('resolves a project goal by file name, alias, and path', () => {
		const goalPath = '00 - P&Q/Goals/2025-01-29 - Learn Python.md';
		const index = buildIndex([
			goal(goalPath, ['Learn Python']),
			project('by-name.md', '2025-01-29 - Learn Python'),
			project('by-alias.md', 'Learn Python'),
			project('by-path.md', goalPath),
			project('by-unknown.md', 'Missing Goal'),
		]);

		expect(index.projectByPath.get('by-name.md')?.goalPath).toBe(goalPath);
		expect(index.projectByPath.get('by-alias.md')?.goalPath).toBe(goalPath);
		expect(index.projectByPath.get('by-path.md')?.goalPath).toBe(goalPath);
		expect(index.projectByPath.get('by-unknown.md')?.goalPath).toBeNull();
	});

	it('links projects back to their goal in sorted order', () => {
		const index = buildIndex([
			goal('goals/Learn Python.md', ['Learn Python']),
			project('projects/z.md', 'Learn Python'),
			project('projects/a.md', 'Learn Python'),
			project('projects/orphan.md', 'Unknown'),
		]);

		expect(index.goalByPath.get('goals/Learn Python.md')?.projectPaths).toEqual([
			'projects/a.md',
			'projects/z.md',
		]);
		expect(index.projectByPath.get('projects/orphan.md')?.goalPath).toBeNull();
	});

	it('indexes a note that has both tags as a goal only', () => {
		const index = buildIndex([
			note('both.md', { tags: ['goal', 'project'], status: 'In Progress' }),
		]);

		expect(index.goals.map((node) => node.path)).toEqual(['both.md']);
		expect(index.projects).toEqual([]);
	});

	it('keeps a project whose goal link is missing', () => {
		const index = buildIndex([
			project('projects/no-goal.md', null),
			note('projects/no-link.md', { tags: 'project', status: 'Waiting' }),
		]);

		expect(index.projects).toHaveLength(2);
		expect(index.projects.every((node) => node.goalPath === null)).toBe(true);
	});
});

describe('project helpers', () => {
	it('strips the leading semicolon from project names', () => {
		expect(noteName('Projects/; Folio.md')).toBe('Folio');
		expect(noteName('Projects/Folio/; Folio.md')).toBe('Folio');
		expect(noteName('Projects/Folio/Notes.md')).toBe('Notes');
	});

	it('detects the folder layout only when it matches the note name', () => {
		expect(projectFolder('Projects/Folio/; Folio.md')).toBe('Projects/Folio');
		expect(projectFolder('Projects/Folio/Notes.md')).toBeNull();
		expect(projectFolder('Projects/; Folio.md')).toBeNull();
	});

	it('does not treat a status-only note as an indexed project', () => {
		const fields = resolveNote({
			path: 'note.md',
			frontmatter: { status: 'In Progress' },
			body: '',
		});

		expect(isIndexedProject(fields)).toBe(false);
	});
});
