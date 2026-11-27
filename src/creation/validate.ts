/** Field checks for the New goal modal, kept pure so they can be tested. */
import { parseTimespan } from '../time/timespan';
import type { GoalDraft } from './plan';

export type GoalField = 'title' | 'category' | 'reason' | 'timespan';

export interface GoalProblem {
	field: GoalField;
	message: string;
}

export type ProjectEditField = 'title' | 'status';

export interface ProjectEditProblem {
	field: ProjectEditField;
	message: string;
}

type GoalValues = Pick<
	GoalDraft,
	'title' | 'category' | 'reason' | 'timespan'
>;

/**
 * A goal needs a title, category, reason, and a readable timespan. The
 * timespan is validated rather than just checked for text, because an
 * unreadable value would leave the goal without a due date.
 */
export function validateGoal(draft: GoalValues): GoalProblem | null {
	if (!draft.title.trim()) {
		return { field: 'title', message: 'Give the goal a title first.' };
	}

	if (!draft.category.trim()) {
		return {
			field: 'category',
			message: 'Choose a category for the goal.',
		};
	}

	if (!draft.reason.trim()) {
		return { field: 'reason', message: 'Add a reason for the goal.' };
	}

	const timespan = draft.timespan.trim();
	if (!timespan) {
		return {
			field: 'timespan',
			message: 'Add a timespan, such as 6 Months or Infinite.',
		};
	}

	if (!parseTimespan(timespan).valid) {
		return {
			field: 'timespan',
			message: 'Enter a timespan such as 6 Months, 1 Year, or Infinite.',
		};
	}

	return null;
}

/**
 * Editing is tolerant: a goal needs a title, and a timespan is checked only
 * when it is present. Category and reason can be cleared.
 */
export function validateGoalEdit(draft: {
	title: string;
	timespan: string;
}): GoalProblem | null {
	if (!draft.title.trim()) {
		return { field: 'title', message: 'Give the goal a title first.' };
	}

	const timespan = draft.timespan.trim();
	if (timespan && !parseTimespan(timespan).valid) {
		return {
			field: 'timespan',
			message: 'Enter a timespan such as 6 Months, 1 Year, or Infinite.',
		};
	}

	return null;
}

export function validateProjectEdit(draft: {
	title: string;
	status: string;
}): ProjectEditProblem | null {
	if (!draft.title.trim()) {
		return { field: 'title', message: 'Give the project a title first.' };
	}

	if (!draft.status.trim()) {
		return { field: 'status', message: 'Choose a status for the project.' };
	}

	return null;
}
