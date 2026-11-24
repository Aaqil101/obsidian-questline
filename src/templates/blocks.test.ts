import { describe, expect, it } from 'vitest';
import { projectTemplateBody } from './blocks';

describe('projectTemplateBody', () => {
	it('builds the default project sections with both blocks', () => {
		const body = projectTemplateBody();

		expect(body).toContain('```timekeep\n{"entries":[]}\n```');
		expect(body).toContain('## Project info');
		expect(body).toContain('```project-progress\n```');
		expect(body).toContain('## Thoughts');
		expect(body).toContain('## Resources');
		expect(body).toContain('## Tasks');

		expect(body.indexOf('timekeep')).toBeLessThan(
			body.indexOf('## Project info'),
		);
		expect(body.indexOf('project-progress')).toBeGreaterThan(
			body.indexOf('## Project info'),
		);
	});

	it('drops a block when its option is off', () => {
		const noTimekeep = projectTemplateBody(true, false);
		const noProgress = projectTemplateBody(false, true);

		expect(noTimekeep).not.toContain('timekeep');
		expect(noTimekeep.startsWith('## Project info')).toBe(true);
		expect(noProgress).not.toContain('project-progress');
		expect(noProgress).toContain('## Project info\n\n## Thoughts');
	});
});
