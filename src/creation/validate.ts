/** Field checks for the New goal modal, kept pure so they can be tested. */
import { parseTimespan } from '../time/timespan';
import type { GoalDraft } from './plan';

export type GoalField = 'title' | 'category' | 'reason' | 'timespan';

export interface GoalProblem {
	field: GoalField;
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
