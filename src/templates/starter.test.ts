import { describe, expect, it } from 'vitest';
import { describeStarterResult, type StarterResult } from './starter';

function result(patch: Partial<StarterResult> = {}): StarterResult {
	return { created: [], existing: [], folderMissing: false, ...patch };
}

describe('describeStarterResult', () => {
	it('asks for a folder before writing anything', () => {
		expect(describeStarterResult(result({ folderMissing: true }))).toBe(
			'Set a template folder first, then create the starter templates.',
		);
	});

	it('reports a full run', () => {
		expect(
			describeStarterResult(
				result({ created: ['templates/Goal template.md', 'templates/Project template.md'] }),
			),
		).toBe('Created 2 starter templates.');
	});

	it('uses the singular for one file', () => {
		expect(
			describeStarterResult(result({ created: ['templates/Goal template.md'] })),
		).toBe('Created 1 starter template.');
	});

	it('never claims to overwrite existing files', () => {
		expect(
			describeStarterResult(
				result({
					created: ['templates/Goal template.md'],
					existing: ['templates/Project template.md'],
				}),
			),
		).toBe(
			'Created 1 starter template. 1 already existed and was left alone.',
		);
		expect(
			describeStarterResult(
				result({ existing: ['templates/Goal template.md'] }),
			),
		).toContain('Nothing was overwritten');
	});

	it('says nothing happened when the run was empty', () => {
		expect(describeStarterResult(result())).toBe(
			'Questline did not create any starter templates.',
		);
	});
});
