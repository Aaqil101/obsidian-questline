export interface TimekeepEntry {
	name?: string;
	startTime: string | null;
	endTime: string | null;
	subEntries: TimekeepEntry[] | null;
}

export interface TimekeepBlock {
	entries: TimekeepEntry[];
}

export interface WorkDuration {
	/** Total duration in milliseconds. */
	ms: number;
	/** Total duration in hours. */
	hours: number;
	/** Leaf entries that had no end time and were counted to now. */
	openEntries: number;
	/** Number of timekeep blocks that contributed. */
	blocks: number;
}

export interface TimekeepWorkOptions {
	/** Current time for open entries. Injectable for tests. */
	now?: Date;
	/** Timekeep's plugin API, when the plugin is installed. */
	api?: TimekeepApi | null;
	/** Moment-like current time passed to the Timekeep API. */
	currentTime?: unknown;
}

const MS_PER_HOUR = 3_600_000;

/** The slice of Timekeep's JS API that Questline uses, all optional. */
export interface TimekeepApi {
	parser: {
		extractTimekeepCodeblocks(body: string): unknown;
	};
	queries: {
		getTotalDuration(entries: unknown[], currentTime: unknown): number;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function timestamp(value: unknown): string | null | undefined {
	if (value === null || value === undefined) return null;

	return typeof value === 'string' ? value : undefined;
}

function normalizeEntry(value: unknown): TimekeepEntry | null {
	if (!isRecord(value)) return null;

	const startTime = timestamp(value.startTime);
	const endTime = timestamp(value.endTime);
	if (startTime === undefined || endTime === undefined) return null;

	let subEntries: TimekeepEntry[] | null = null;
	if (Array.isArray(value.subEntries)) {
		subEntries = value.subEntries
			.map(normalizeEntry)
			.filter((entry): entry is TimekeepEntry => entry !== null);
	}

	return {
		name: typeof value.name === 'string' ? value.name : undefined,
		startTime,
		endTime,
		subEntries,
	};
}

function parseBlock(content: string): TimekeepBlock | null {
	const text = content.trim();
	if (!text) return { entries: [] };

	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}

	if (!isRecord(value) || !Array.isArray(value.entries)) return null;

	const entries = value.entries
		.map(normalizeEntry)
		.filter((entry): entry is TimekeepEntry => entry !== null);

	return { entries };
}

/** Read every fenced `timekeep` block in a note, skipping broken ones. */
export function extractTimekeepBlocks(body: string): TimekeepBlock[] {
	const lines = body.split(/\r?\n/);
	const blocks: TimekeepBlock[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		if (!line.trim().startsWith('```timekeep')) continue;

		let end = index + 1;
		while (end < lines.length && (lines[end] ?? '').trim() !== '```') end += 1;
		if (end >= lines.length) break;

		const block = parseBlock(lines.slice(index + 1, end).join('\n'));
		if (block) blocks.push(block);
		index = end;
	}

	return blocks;
}

function parseTimestamp(value: string): Date | null {
	const date = new Date(value);

	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Sum every leaf entry. Groups use their children only, matching Timekeep,
 * and an entry with no end time ends at `now`.
 */
export function sumTimekeepBlocks(
	blocks: readonly TimekeepBlock[],
	now: Date = new Date(),
): WorkDuration {
	let ms = 0;
	let openEntries = 0;

	const visit = (entries: readonly TimekeepEntry[]): void => {
		for (const entry of entries) {
			if (entry.subEntries !== null) {
				visit(entry.subEntries);
				continue;
			}

			// An entry that was never started contributes nothing.
			if (entry.startTime === null) continue;

			const start = parseTimestamp(entry.startTime);
			if (!start) continue;

			let end: Date;
			if (entry.endTime === null) {
				end = now;
				openEntries += 1;
			} else {
				const parsed = parseTimestamp(entry.endTime);
				if (!parsed) continue;
				end = parsed;
			}

			ms += Math.max(0, end.getTime() - start.getTime());
		}
	};

	for (const block of blocks) visit(block.entries);

	return {
		ms,
		hours: ms / MS_PER_HOUR,
		openEntries,
		blocks: blocks.length,
	};
}

function apiShape(value: unknown): TimekeepApi | null {
	if (!isRecord(value)) return null;

	const parser = value.parser;
	const queries = value.queries;
	if (!isRecord(parser) || !isRecord(queries)) return null;
	if (typeof parser.extractTimekeepCodeblocks !== 'function') return null;
	if (typeof queries.getTotalDuration !== 'function') return null;

	return value as unknown as TimekeepApi;
}

function timekeepPlugin(
	pluginHost: unknown,
): Record<string, unknown> | null {
	if (!isRecord(pluginHost)) return null;

	const manager = pluginHost.plugins;
	if (!isRecord(manager)) return null;

	// Tests and older callers pass the plugin map directly. The real app
	// nests it under app.plugins.plugins.
	const direct = manager.timekeep;
	if (isRecord(direct)) return direct;

	const registry = manager.plugins;
	if (!isRecord(registry)) return null;

	const nested = registry.timekeep;

	return isRecord(nested) ? nested : null;
}

/**
 * Find the Timekeep API through `app.plugins`. Returns null when Timekeep is
 * not installed or does not expose the expected API.
 */
export function findTimekeepApi(pluginHost: unknown): TimekeepApi | null {
	const timekeep = timekeepPlugin(pluginHost);

	return timekeep ? apiShape(timekeep.api) : null;
}

/** True when Timekeep is loaded and present in the plugin registry. */
export function isTimekeepInstalled(pluginHost: unknown): boolean {
	return timekeepPlugin(pluginHost) !== null;
}

/**
 * Let Timekeep total the blocks when its API is available, so a running
 * timer uses the plugin's own clock. Returns null when the API cannot answer.
 */
export function sumWithTimekeepApi(
	api: TimekeepApi,
	body: string,
	currentTime: unknown,
): number | null {
	try {
		const blocks = api.parser.extractTimekeepCodeblocks(body);
		if (!Array.isArray(blocks)) return null;

		let total = 0;
		for (const block of blocks) {
			if (!isRecord(block) || !Array.isArray(block.entries)) return null;

			const duration = api.queries.getTotalDuration(block.entries, currentTime);
			if (typeof duration !== 'number' || !Number.isFinite(duration)) {
				return null;
			}

			total += duration;
		}

		return total;
	} catch {
		return null;
	}
}

function withApi(
	own: WorkDuration,
	body: string,
	options: TimekeepWorkOptions,
): WorkDuration {
	const { api, currentTime } = options;
	const viaApi =
		api && currentTime !== undefined
			? sumWithTimekeepApi(api, body, currentTime)
			: null;

	return viaApi === null
		? own
		: {
				...own,
				ms: viaApi,
				hours: viaApi / MS_PER_HOUR,
			};
}

/** Sum work hours in one note, preferring Timekeep's API when available. */
export function sumWorkHours(
	body: string,
	options: TimekeepWorkOptions = {},
): WorkDuration {
	const blocks = extractTimekeepBlocks(body);
	const own = sumTimekeepBlocks(blocks, options.now ?? new Date());

	return withApi(own, body, options);
}

/**
 * Cache parsed blocks by path and mtime. Summaries are recomputed on each
 * call because an open entry ends at the current time.
 */
export class TimekeepCache {
	private readonly cache = new Map<
		string,
		{ mtime: number; blocks: TimekeepBlock[] }
	>();

	getBlocks(path: string, mtime: number, body: string): TimekeepBlock[] {
		const cached = this.cache.get(path);
		if (cached && cached.mtime === mtime) return cached.blocks;

		const blocks = extractTimekeepBlocks(body);
		this.cache.set(path, { mtime, blocks });

		return blocks;
	}

	summarize(
		path: string,
		mtime: number,
		body: string,
		options: TimekeepWorkOptions = {},
	): WorkDuration {
		const blocks = this.getBlocks(path, mtime, body);
		const own = sumTimekeepBlocks(blocks, options.now ?? new Date());

		return withApi(own, body, options);
	}

	forget(path: string): void {
		this.cache.delete(path);
	}

	clear(): void {
		this.cache.clear();
	}
}
