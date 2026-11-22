/**
 * Settings tab. This file is the tab shell only: it returns the landing
 * groups, each built by its own module, and Obsidian renders and indexes them.
 * A sub-page is a `page` definition, so back navigation is native.
 */
import {
	PluginSettingTab,
	type App,
	type SettingDefinitionItem,
} from 'obsidian';
import type QuestlinePlugin from '../main';
import { creationGroup } from './creation';
import { notesGroup } from './notes';
import { timeGroup } from './time';
import type { SettingsHost } from './ui';

export * from './types';

export class QuestlineSettingTab
	extends PluginSettingTab
	implements SettingsHost
{
	plugin: QuestlinePlugin;

	constructor(app: App, plugin: QuestlinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [notesGroup(this), creationGroup(this), timeGroup(this)];
	}

	/** Re-render the tab after a change that alters the definitions. */
	refresh(): void {
		this.update();
	}
}
