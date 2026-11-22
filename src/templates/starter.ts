/**
 * Starter template results and their user-facing messages. This stays free
 * of Obsidian imports so the copy can be tested without a running app.
 */

export interface StarterResult {
	/** Paths that were written. */
	created: string[];
	/** Paths that already existed and were left untouched. */
	existing: string[];
	/** True when no template folder is configured, so nothing was written. */
	folderMissing: boolean;
}

function countTemplates(count: number): string {
	return `${count} starter template${count === 1 ? '' : 's'}`;
}

/** Report a starter run without claiming anything was overwritten. */
export function describeStarterResult(result: StarterResult): string {
	if (result.folderMissing) {
		return 'Set a template folder first, then create the starter templates.';
	}

	if (result.created.length === 0) {
		return result.existing.length > 0
			? 'Questline starter templates already exist. Nothing was overwritten.'
			: 'Questline did not create any starter templates.';
	}

	if (result.existing.length === 0) {
		return `Created ${countTemplates(result.created.length)}.`;
	}

	const left = result.existing.length === 1 ? 'was' : 'were';

	return `Created ${countTemplates(result.created.length)}. ${result.existing.length} already existed and ${left} left alone.`;
}
