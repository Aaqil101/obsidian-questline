/**
 * Built-in templates. A vault with no template files still gets a usable
 * goal or project body. The starter templates are the same bodies plus the
 * marker that keeps them out of the index, ready to edit in the vault.
 */
import { TEMPLATE_TYPE } from '../constants';
import { projectTemplateBody } from './blocks';
import type { TemplateDocument } from './document';

export const BUILTIN_GOAL: TemplateDocument = {
	frontmatter: null,
	body: `## What does success look like?

-

## Related core values

-

## Project ideas

-

## Active projects
`,
};

export const BUILTIN_PROJECT: TemplateDocument = {
	frontmatter: null,
	body: projectTemplateBody(),
};

export const BUILTIN_AUTHOR: TemplateDocument = {
	frontmatter: null,
	body: `## About

`,
};

const GOAL_HINT = `%%
Questline goal template.
The body below is copied into every new goal. Questline writes the
frontmatter itself, so this note only needs the text you want to reuse.
%%`;

const PROJECT_HINT = `%%
Questline project template.
The body below is copied into every new project that uses this template.
Questline writes the frontmatter itself, so this note only needs the text
you want to reuse.
%%`;

const STARTER_GOAL_BODY = `${GOAL_HINT}

${BUILTIN_GOAL.body}`;

const STARTER_PROJECT_BODY = `${PROJECT_HINT}

${BUILTIN_PROJECT.body}`;

const AUTHOR_HINT = `%%
Questline author template.
The body below is copied into every new author note.
Questline writes the frontmatter itself, so this note only needs the text
you want to reuse.
%%`;

const STARTER_AUTHOR_BODY = `${AUTHOR_HINT}

${BUILTIN_AUTHOR.body}`;

export interface StarterTemplate {
	/** File name without the folder or `.md` extension. */
	fileName: string;
	/** Settings key that should point at this template when it is unset. */
	setting: 'goalTemplate' | 'projectTemplate' | 'authorTemplate';
	document: TemplateDocument;
}

/** Files written by the `Create starter templates` command. */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
	{
		fileName: 'Goal template',
		setting: 'goalTemplate',
		document: {
			frontmatter: { type: TEMPLATE_TYPE },
			body: STARTER_GOAL_BODY,
		},
	},
	{
		fileName: 'Project template',
		setting: 'projectTemplate',
		document: {
			frontmatter: { type: TEMPLATE_TYPE },
			body: STARTER_PROJECT_BODY,
		},
	},
	{
		fileName: 'Author template',
		setting: 'authorTemplate',
		document: {
			frontmatter: { type: TEMPLATE_TYPE },
			body: STARTER_AUTHOR_BODY,
		},
	},
];
