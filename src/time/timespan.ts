const DAY_MS = 86_400_000;

export type TimespanKind =
	| 'infinite'
	| 'years'
	| 'months'
	| 'weeks'
	| 'days'
	| 'date';

export interface TimespanResult {
	/** Trimmed source value. */
	raw: string;
	/** False for empty, unreadable, or unknown values. */
	valid: boolean;
	/** True for `♾Infinite`, which has no due date. */
	infinite: boolean;
	kind: TimespanKind | null;
	/** Duration amount for a duration kind; null for a date or infinite. */
	amount: number | null;
	/** Due date as `YYYY-MM-DD`, or null when it cannot be known. */
	dueDate: string | null;
	/** Whole days from today to the due date; negative when overdue. */
	remainingDays: number | null;
	overdue: boolean;
}

export interface TimespanOptions {
	/** Goal creation date; durations are measured from here. */
	created?: string | Date | null;
	/** Current time, injectable for tests. */
	now?: Date;
}

interface ParsedTimespan {
	kind: TimespanKind;
	amount: number | null;
}

const INFINITE = /^(?:(?:♾️?|∞)\s*)?infinite$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;
const SHORTHAND =
	/^(\d+)\s*(y|yr|yrs|year|years|m|mo|mos|month|months|w|wk|wks|week|weeks|d|day|days)$/i;
const PLAIN = /^(\d+)\s*(years?|months?|weeks?|days?)$/i;

const LEGACY: readonly { pattern: RegExp; kind: ParsedTimespan['kind'] }[] = [
	{ pattern: /^📅️?\s*(.+?)\s*years?$/i, kind: 'years' },
	{ pattern: /^📆️?\s*(.+?)\s*months?$/i, kind: 'months' },
	{ pattern: /^⌛️?\s*(.+?)\s*weeks?$/i, kind: 'weeks' },
	{ pattern: /^🕒️?\s*(.+?)\s*days?$/i, kind: 'days' },
];

const KEYCAPS: readonly (readonly [string, number])[] = [
	['🔟', 10],
	['1️⃣', 1],
	['2️⃣', 2],
	['3️⃣', 3],
	['4️⃣', 4],
	['5️⃣', 5],
	['6️⃣', 6],
	['7️⃣', 7],
	['8️⃣', 8],
	['9️⃣', 9],
];

function emptyResult(raw: string): TimespanResult {
	return {
		raw,
		valid: false,
		infinite: false,
		kind: null,
		amount: null,
		dueDate: null,
		remainingDays: null,
		overdue: false,
	};
}

function amountFrom(text: string): number | null {
	for (const [symbol, value] of KEYCAPS) {
		if (text.includes(symbol)) return value;
	}

	const digits = /\d+/.exec(text);
	if (!digits) return null;

	const amount = Number(digits[0]);
	return Number.isFinite(amount) ? amount : null;
}

function parseValue(value: string): ParsedTimespan | null {
	if (INFINITE.test(value)) return { kind: 'infinite', amount: null };

	for (const { pattern, kind } of LEGACY) {
		const match = pattern.exec(value);
		if (!match) continue;

		const amount = amountFrom(match[1] ?? '');
		return amount === null ? null : { kind, amount };
	}

	const shorthand = SHORTHAND.exec(value) ?? PLAIN.exec(value);
	if (shorthand) {
		const amount = Number(shorthand[1]);
		const unit = (shorthand[2] ?? '').toLowerCase();
		const kind: ParsedTimespan['kind'] = unit.startsWith('y')
			? 'years'
			: unit.startsWith('m')
				? 'months'
				: unit.startsWith('w')
					? 'weeks'
					: 'days';

		return Number.isFinite(amount) ? { kind, amount } : null;
	}

	if (ISO_DATE.test(value)) {
		return parseDate(value) ? { kind: 'date', amount: null } : null;
	}

	return null;
}

/** Parse `YYYY-MM-DD`, optional time, or a full ISO timestamp. */
export function parseDate(value: string | Date | null | undefined): Date | null {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
	}

	if (typeof value !== 'string') return null;

	const text = value.trim();
	if (!text) return null;

	if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) {
		const parsed = new Date(text);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	const match =
		/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?/.exec(
			text,
		);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4] ?? 0);
	const minute = Number(match[5] ?? 0);
	const second = Number(match[6] ?? 0);
	const date = new Date(year, month - 1, day, hour, minute, second);

	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}

	return date;
}

function addMonths(date: Date, months: number): Date {
	const target = new Date(
		date.getFullYear(),
		date.getMonth() + months,
		1,
		date.getHours(),
		date.getMinutes(),
		date.getSeconds(),
		date.getMilliseconds(),
	);
	const lastDay = new Date(
		target.getFullYear(),
		target.getMonth() + 1,
		0,
	).getDate();

	return new Date(
		target.getFullYear(),
		target.getMonth(),
		Math.min(date.getDate(), lastDay),
		date.getHours(),
		date.getMinutes(),
		date.getSeconds(),
		date.getMilliseconds(),
	);
}

function addDays(date: Date, days: number): Date {
	return new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate() + days,
		date.getHours(),
		date.getMinutes(),
		date.getSeconds(),
		date.getMilliseconds(),
	);
}

function dueFor(parsed: ParsedTimespan, created: Date | null): Date | null {
	if (!created || parsed.amount === null) return null;

	switch (parsed.kind) {
		case 'years':
			return addMonths(created, parsed.amount * 12);
		case 'months':
			return addMonths(created, parsed.amount);
		case 'weeks':
			return addDays(created, parsed.amount * 7);
		case 'days':
			return addDays(created, parsed.amount);
		default:
			return null;
	}
}

function formatDate(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');

	return `${date.getFullYear()}-${month}-${day}`;
}

function dayNumber(date: Date): number {
	return Math.floor(
		Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS,
	);
}

/**
 * Parse a goal timespan into a due date. Legacy emoji values from the P&Q
 * vault and the shorter `1y`/`6m`/`2w`/`3d` forms both work, as does an ISO
 * date. An unreadable value returns `valid: false` instead of throwing.
 */
export function parseTimespan(
	raw: string | null | undefined,
	options: TimespanOptions = {},
): TimespanResult {
	const text = typeof raw === 'string' ? raw.trim() : '';
	if (!text) return emptyResult(text);

	const parsed = parseValue(text);
	if (!parsed) return emptyResult(text);

	if (parsed.kind === 'infinite') {
		return {
			raw: text,
			valid: true,
			infinite: true,
			kind: 'infinite',
			amount: null,
			dueDate: null,
			remainingDays: null,
			overdue: false,
		};
	}

	const due =
		parsed.kind === 'date'
			? parseDate(text)
			: dueFor(parsed, parseDate(options.created));

	if (!due) {
		return {
			raw: text,
			valid: true,
			infinite: false,
			kind: parsed.kind,
			amount: parsed.amount,
			dueDate: null,
			remainingDays: null,
			overdue: false,
		};
	}

	const now = options.now ?? new Date();
	const remainingDays = dayNumber(due) - dayNumber(now);

	return {
		raw: text,
		valid: true,
		infinite: false,
		kind: parsed.kind,
		amount: parsed.amount,
		dueDate: formatDate(due),
		remainingDays,
		overdue: remainingDays < 0,
	};
}
