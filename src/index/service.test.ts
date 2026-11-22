import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestlineIndexService } from './service';
import type { NoteData, NoteFile, NoteReader } from './service';

interface FakeNote {
	mtime: number;
	frontmatter: Record<string, unknown> | null;
	body: string;
}

class FakeReader implements NoteReader {
	notes = new Map<string, FakeNote>();
	reads: string[] = [];
	failing = new Set<string>();

	listNotes(): NoteFile[] {
		return [...this.notes.entries()].map(([path, note]) => ({
			path,
			mtime: note.mtime,
		}));
	}

	async readNote(path: string): Promise<NoteData> {
		this.reads.push(path);
		if (this.failing.has(path)) throw new Error(`Unreadable: ${path}`);

		const note = this.notes.get(path);
		if (!note) throw new Error(`Missing: ${path}`);

		return {
			body: note.body,
			frontmatter: note.frontmatter,
			tasks: [],
			headings: [],
		};
	}
}

function seed(reader: FakeReader): void {
	reader.notes.set('goals/Learn Python.md', {
		mtime: 1,
		frontmatter: { tags: 'goal', aliases: 'Learn Python' },
		body: '',
	});
	reader.notes.set('projects/; Folio.md', {
		mtime: 1,
		frontmatter: { status: 'In Progress' },
		body: 'Goal:: [[Learn Python]]\ntags:: #project',
	});
}

afterEach(() => {
	vi.useRealTimers();
});

describe('QuestlineIndexService', () => {
	it('reads every note once and reuses the cache', async () => {
		const reader = new FakeReader();
		seed(reader);
		const service = new QuestlineIndexService(reader);

		const first = await service.refresh();

		expect(first.goals).toHaveLength(1);
		expect(first.projects).toHaveLength(1);
		expect(reader.reads).toHaveLength(2);

		reader.reads = [];
		const second = await service.refresh();

		expect(reader.reads).toEqual([]);
		expect(second).toBe(first);
	});

	it('rereads only a note whose mtime changed', async () => {
		const reader = new FakeReader();
		seed(reader);
		const service = new QuestlineIndexService(reader);
		await service.refresh();

		reader.reads = [];
		const folio = reader.notes.get('projects/; Folio.md');
		if (!folio) throw new Error('missing fixture');
		folio.mtime = 2;
		folio.frontmatter = { status: 'Completed' };

		const index = await service.refresh();

		expect(reader.reads).toEqual(['projects/; Folio.md']);
		expect(index.projectByPath.get('projects/; Folio.md')?.fields.status).toBe(
			'Completed',
		);
	});

	it('removes cached notes that left the vault', async () => {
		const reader = new FakeReader();
		seed(reader);
		const service = new QuestlineIndexService(reader);
		await service.refresh();

		reader.notes.delete('projects/; Folio.md');
		reader.reads = [];
		const index = await service.refresh();

		expect(reader.reads).toEqual([]);
		expect(index.projects).toEqual([]);
		expect(index.notes.has('projects/; Folio.md')).toBe(false);
	});

	it('forgets a path so a rename at the same mtime is read again', async () => {
		const reader = new FakeReader();
		seed(reader);
		const service = new QuestlineIndexService(reader);
		await service.refresh();

		reader.reads = [];
		service.forget('goals/Learn Python.md');
		await service.refresh();

		expect(reader.reads).toEqual(['goals/Learn Python.md']);
	});

	it('notifies listeners only when the index changes', async () => {
		const reader = new FakeReader();
		seed(reader);
		const service = new QuestlineIndexService(reader);
		const seen: number[] = [];
		const unsubscribe = service.onRefresh((index) => {
			seen.push(index.projects.length);
		});

		await service.refresh();
		await service.refresh();
		unsubscribe();
		reader.notes.delete('projects/; Folio.md');
		await service.refresh();

		expect(seen).toEqual([1]);
	});

	it('coalesces vault events into one debounced refresh', async () => {
		vi.useFakeTimers();
		const reader = new FakeReader();
		seed(reader);
		const service = new QuestlineIndexService(reader, { debounceMs: 100 });

		service.scheduleRefresh();
		service.scheduleRefresh();
		service.scheduleRefresh();

		expect(reader.reads).toEqual([]);
		await vi.advanceTimersByTimeAsync(99);
		expect(reader.reads).toEqual([]);

		await vi.advanceTimersByTimeAsync(1);
		expect(reader.reads).toHaveLength(2);

		service.destroy();
	});

	it('drops a scheduled refresh when destroyed', async () => {
		vi.useFakeTimers();
		const reader = new FakeReader();
		seed(reader);
		const service = new QuestlineIndexService(reader, { debounceMs: 100 });

		service.scheduleRefresh();
		service.destroy();
		await vi.advanceTimersByTimeAsync(500);

		expect(reader.reads).toEqual([]);
	});

	it('keeps indexing when one note cannot be read', async () => {
		const reader = new FakeReader();
		seed(reader);
		reader.failing.add('projects/; Folio.md');
		const service = new QuestlineIndexService(reader);

		const index = await service.refresh();

		expect(index.goals).toHaveLength(1);
		expect(index.projects).toEqual([]);
	});
});
