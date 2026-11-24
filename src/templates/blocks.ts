/** Code blocks and markers that creation can add to a new note. */
export const GOAL_PROGRESS_BLOCK = '```goal-progress\n```';
export const PROJECT_PROGRESS_BLOCK = '```project-progress\n```';
export const TIMEKEEP_BLOCK = '```timekeep\n{"entries":[]}\n```';

export const GOAL_PROGRESS_MARKER = /^[ \t]*(?:```|~~~)\s*goal-progress\b/im;
export const PROJECT_PROGRESS_MARKER =
	/^[ \t]*(?:```|~~~)\s*project-progress\b/im;
export const TIMEKEEP_MARKER = /^[ \t]*(?:```|~~~)\s*timekeep\b/im;

/**
 * The built-in project body. The two optional blocks sit where the original
 * dashboard template placed them, so a new project is useful immediately.
 */
export function projectTemplateBody(
	includeProgress = true,
	includeTimekeep = true,
): string {
	const parts: string[] = [];

	if (includeTimekeep) parts.push(TIMEKEEP_BLOCK);
	parts.push('## Project info');
	if (includeProgress) parts.push(PROJECT_PROGRESS_BLOCK);
	parts.push('## Thoughts', '## Resources', '## Tasks');

	return parts.join('\n\n');
}
