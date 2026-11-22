/**
 * Creation plans. Everything here is pure: the caller supplies the template
 * documents, the clock, and a way to ask whether a path is taken. The plugin
 * turns the result into files; tests can inspect it without a vault.
 */
import { TEMPLATE_TYPE } from '../constants';
import type { QuestlineConfig } from '../settings/types';
import { normalizeFolder } from '../settings/types';
import { BUILTIN_GOAL, BUILTIN_PROJECT } from '../templates/builtin';
import {
	composeNote,
	type NoteParts,
	type TemplateDocument,
} from '../templates/document';
import {
	formatDate,
	renderFilename,
	type TemplateValues,
} from '../templates/render';

/** Characters Obsidian or a link cannot carry, plus control characters. */
const INVALID_NAME = /[\\/:*?"<>|#^[\]]/g;
const CONTROL = /\p{Cc}/gu;

const MAX_COLLISIONS = 1000;

export type GoalTemplateMode = 'custom' | 'global';

export interface GoalDraft {
	title: string;
	category: string;
	reason: string;
	timespan: string;
	folder: string;
	template: GoalTemplateMode;
}

export interface ProjectGoalLink {
	path: string;
	name: string;
	/** Alias shown in the goal picker, when the goal has one. */
	display?: string;
}

export interface ProjectDraft {
	title: string;
	goal: ProjectGoalLink | null;
	status: string;
	author: string;
	subtitle: string;
	/** Vault path of a template note, or blank for the resolved default. */
	template: string;
	folder: string;
}

export interface PlannedTemplate {
	path: string;
	parts: NoteParts;
}

/** A note to write, plus an optional template note it depends on. */
export interface CreationPlan {
	path: string;
	note: NoteParts;
	template: PlannedTemplate | null;
}

export interface PlanContext {
	config: QuestlineConfig;
	now: Date;
	/** True when the path is already used, ignoring case. */
	exists: (path: string) => boolean;
}

export interface GoalPlanTemplates {
	/** Global goal template, or null for the built-in body. */
	goal: TemplateDocument | null;
	/** Global project template, used to seed a custom one. */
	project: TemplateDocument | null;
}

export interface ProjectPlanTemplates {
	/** The resolved template document, or null for the built-in body. */
	template: TemplateDocument | null;
}

/**
 * Turn a title into a safe note name. Invalid characters become spaces so
 * `Learn: Python` reads as `Learn Python`, repeated spaces collapse, and a
 * name can never start or end with a dot.
 */
export function sanitizeName(value: string): string {
	return value
		.replace(/\.md$/i, '')
		.replace(INVALID_NAME, ' ')
		.replace(CONTROL, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+/, '')
		.replace(/\.+$/, '')
		.trim();
}

/** Vault path without the `.md` extension, as a link target. */
export function withoutExtension(path: string): string {
	return path.replace(/\.md$/i, '');
}

function joinPath(folder: string, fileName: string): string {
	return folder ? `${folder}/${fileName}` : fileName;
}

/**
 * A free `.md` path in `folder`. A taken name gains ` 2`, ` 3`, and so on.
 * The caller decides what "taken" means, so creation can reserve the custom
 * template path before it is written.
 */
export function allocatePath(
	folder: string,
	name: string,
	exists: (path: string) => boolean,
): string {
	const base = sanitizeName(name);
	if (!base) throw new Error('A note needs a name.');

	for (let suffix = 1; suffix <= MAX_COLLISIONS; suffix += 1) {
		const fileName = suffix === 1 ? base : `${base} ${suffix}`;
		const path = joinPath(normalizeFolder(folder), `${fileName}.md`);
		if (!exists(path)) return path;
	}

	throw new Error(`Could not find a free filename for ${base}.`);
}

function noteName(
	pattern: string,
	values: TemplateValues,
	now: Date,
	fallback: string,
): string {
	const rendered = sanitizeName(renderFilename(pattern, values, now));
	if (rendered) return rendered;

	return sanitizeName(values.title) || fallback;
}

/** Frontmatter for a template note: keep useful keys, replace the marker. */
function templateFrontmatter(
	frontmatter: Record<string, unknown> | null,
): Record<string, unknown> {
	const clean: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(frontmatter ?? {})) {
		if (key.toLowerCase() === 'type') continue;
		clean[key] = value;
	}

	clean.type = TEMPLATE_TYPE;

	return clean;
}

/**
 * A project template for one goal. Its body is seeded from the global
 * project template, or the built-in one, and left unrendered so the tokens
 * still apply when a project is created from it.
 */
export function planProjectTemplate(
	title: string,
	context: PlanContext,
	seed: TemplateDocument | null,
): PlannedTemplate {
	const source = seed ?? BUILTIN_PROJECT;
	const name = sanitizeName(`${title} project template`);

	return {
		path: allocatePath(
			context.config.templateFolder,
			name || 'Goal project template',
			context.exists,
		),
		parts: {
			frontmatter: templateFrontmatter(source.frontmatter),
			body: source.body,
		},
	};
}

/** A link to a note, using the goal name or alias as its display text. */
export function noteLink(goal: ProjectGoalLink): string {
	const target = withoutExtension(goal.path);
	const display = (goal.display || goal.name).trim();

	return display && display !== target
		? `[[${target}|${display}]]`
		: `[[${target}]]`;
}

/**
 * Plan a goal note. A custom project template is planned first so its path
 * is reserved, then the goal link points at it. The goal itself uses the
 * global goal template, or the built-in body when none is configured.
 */
export function planGoal(
	draft: GoalDraft,
	context: PlanContext,
	templates: GoalPlanTemplates,
): CreationPlan {
	const { config, exists, now } = context;
	const title = draft.title.trim();
	const category = draft.category.trim();
	const reason = draft.reason.trim();
	const timespan = draft.timespan.trim();
	const values: TemplateValues = { title, category, reason, timespan };

	const template =
		draft.template === 'custom'
			? planProjectTemplate(title, context, templates.project)
			: null;

	const isTaken = (path: string): boolean =>
		path === template?.path || exists(path);

	const core: Record<string, unknown> = {
		tags: [config.goalTag],
		created: formatDate(now, 'YYYY-MM-DD'),
	};
	if (category) core.category = category;
	if (reason) core.reason = reason;
	if (timespan) core.timespan = timespan;
	if (template) core.project_template = `[[${withoutExtension(template.path)}]]`;

	return {
		path: allocatePath(
			draft.folder,
			noteName(config.goalFilename, values, now, 'Untitled goal'),
			isTaken,
		),
		note: composeNote({
			template: templates.goal,
			fallback: BUILTIN_GOAL,
			core,
			values,
			now,
		}),
		template,
	};
}

/**
 * Plan a project note. A selected goal becomes a `goal` link, and an empty
 * status falls back to the first configured status so the index still picks
 * the project up. A standalone project simply omits the link.
 */
export function planProject(
	draft: ProjectDraft,
	context: PlanContext,
	templates: ProjectPlanTemplates,
): CreationPlan {
	const { config, now } = context;
	const title = draft.title.trim();
	const author = draft.author.trim();
	const subtitle = draft.subtitle.trim();
	const status = draft.status.trim() || config.projectStatuses[0] || 'Todo';
	const goalLink = draft.goal ? noteLink(draft.goal) : null;

	const values: TemplateValues = {
		title,
		goal: goalLink,
		goalName: draft.goal?.name ?? null,
		author,
		subtitle,
		status,
	};

	const core: Record<string, unknown> = {
		tags: [config.projectTag],
		created: formatDate(now, 'YYYY-MM-DD'),
		status,
	};
	if (author) core.author = author;
	if (subtitle) core.subtitle = subtitle;
	if (goalLink) core.goal = goalLink;

	return {
		path: allocatePath(
			draft.folder,
			noteName(config.projectFilename, values, now, 'Untitled project'),
			context.exists,
		),
		note: composeNote({
			template: templates.template,
			fallback: BUILTIN_PROJECT,
			core,
			values,
			now,
		}),
		template: null,
	};
}
