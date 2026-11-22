/**
 * Template and filename tokens. Every value is supplied by creation, and
 * every date is rendered from one timestamp so a filename and its note body
 * always agree. Unknown tokens are left exactly as written, so a typo stays
 * visible in the note instead of quietly disappearing.
 */

export interface TemplateValues {
	title: string;
	/** Goal link, such as `[[Learn Python]]`. */
	goal?: string | null;
	/** Plain goal name, without link brackets. */
	goalName?: string | null;
	category?: string | null;
	author?: string | null;
	subtitle?: string | null;
	status?: string | null;
}

const TOKEN = /\{\{([^{}]*)\}\}/g;

const DEFAULT_FORMATS = {
	date: 'YYYY-MM-DD',
	time: 'HH:mm',
	created: 'YYYY-MM-DD HH:mm',
} as const;

type DateToken = keyof typeof DEFAULT_FORMATS;

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

const MONTHS_SHORT = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
];

const WEEKDAYS = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
];

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Longest tokens come first so a shorter token never splits a longer one. */
const FORMAT_TOKEN =
	/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a/g;

function pad(value: number, width = 2): string {
	return String(value).padStart(width, '0');
}

/** `1st`, `2nd`, `3rd`, `11th`, and so on. */
function ordinal(day: number): string {
	const mod100 = day % 100;
	if (mod100 >= 11 && mod100 <= 13) return `${day}th`;

	switch (day % 10) {
		case 1:
			return `${day}st`;
		case 2:
			return `${day}nd`;
		case 3:
			return `${day}rd`;
		default:
			return `${day}th`;
	}
}

/**
 * Moment-style date formatting for the tokens a filename or template is
 * likely to use (`YYYY`, `MMMM`, `dddd`, `HH`, `hh`, `A`, and friends).
 * Bracketed text is copied through, so `[Week of] YYYY` keeps its label.
 * Tokens Questline does not know are copied through unchanged, never
 * silently dropped.
 */
export function formatDate(date: Date, format: string): string {
	return format.replace(FORMAT_TOKEN, (token, literal?: string) => {
		if (literal !== undefined) return literal;

		const hours = date.getHours();
		const hour12 = hours % 12 || 12;

		switch (token) {
			case 'YYYY':
				return String(date.getFullYear());
			case 'YY':
				return pad(date.getFullYear() % 100);
			case 'MMMM':
				return MONTHS[date.getMonth()] ?? '';
			case 'MMM':
				return MONTHS_SHORT[date.getMonth()] ?? '';
			case 'MM':
				return pad(date.getMonth() + 1);
			case 'M':
				return String(date.getMonth() + 1);
			case 'DD':
				return pad(date.getDate());
			case 'D':
				return String(date.getDate());
			case 'Do':
				return ordinal(date.getDate());
			case 'dddd':
				return WEEKDAYS[date.getDay()] ?? '';
			case 'ddd':
				return WEEKDAYS_SHORT[date.getDay()] ?? '';
			case 'HH':
				return pad(hours);
			case 'H':
				return String(hours);
			case 'hh':
				return pad(hour12);
			case 'h':
				return String(hour12);
			case 'mm':
				return pad(date.getMinutes());
			case 'm':
				return String(date.getMinutes());
			case 'ss':
				return pad(date.getSeconds());
			case 's':
				return String(date.getSeconds());
			case 'A':
				return hours < 12 ? 'AM' : 'PM';
			case 'a':
				return hours < 12 ? 'am' : 'pm';
			default:
				return token;
		}
	});
}

/** The plain-text tokens. A date token is handled separately. */
function simpleToken(name: string, values: TemplateValues): string | null {
	switch (name) {
		case 'title':
			return values.title;
		case 'goal':
			return values.goal ?? '';
		case 'goal_name':
			return values.goalName ?? '';
		case 'category':
			return values.category ?? '';
		case 'author':
			return values.author ?? '';
		case 'subtitle':
			return values.subtitle ?? '';
		case 'status':
			return values.status ?? '';
		default:
			return null;
	}
}

function isDateToken(name: string): name is DateToken {
	return name === 'date' || name === 'time' || name === 'created';
}

/**
 * Replace every token in `text`. Token names are case-insensitive, an empty
 * value becomes an empty string, and an unknown token is preserved verbatim.
 */
export function renderTokens(
	text: string,
	values: TemplateValues,
	now: Date = new Date(),
): string {
	return text.replace(TOKEN, (match, inner: string) => {
		const colon = inner.indexOf(':');
		const name = (colon >= 0 ? inner.slice(0, colon) : inner)
			.trim()
			.toLowerCase();
		const format = colon >= 0 ? inner.slice(colon + 1).trim() : '';

		const simple = simpleToken(name, values);
		if (simple !== null) return simple;

		if (isDateToken(name)) {
			return formatDate(now, format || DEFAULT_FORMATS[name]);
		}

		return match;
	});
}

/**
 * Render a filename pattern with the same tokens as a template body. The
 * caller sanitizes the result and adds the extension.
 */
export function renderFilename(
	pattern: string,
	values: TemplateValues,
	now: Date = new Date(),
): string {
	return renderTokens(pattern, values, now);
}
