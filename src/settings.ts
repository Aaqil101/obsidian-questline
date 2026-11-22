import { App, PluginSettingTab, Setting } from 'obsidian';
import QuestlinePlugin from './main';

export interface QuestlineSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: QuestlineSettings = {
	mySetting: 'default',
};

export class QuestlineSettingTab extends PluginSettingTab {
	plugin: QuestlinePlugin;

	constructor(app: App, plugin: QuestlinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder('Enter your secret')
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
