import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	QuestlineSettings,
	QuestlineSettingTab,
} from './settings';

export default class QuestlinePlugin extends Plugin {
	settings!: QuestlineSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new QuestlineSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<QuestlineSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
