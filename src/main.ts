import { Plugin, TFile } from 'obsidian';
import { QuestlineIndexService } from './index/service';
import { createVaultReader, WINDOW_TIMERS } from './index/source';
import type { QuestlineIndex } from './index/types';
import {
	DEFAULT_SETTINGS,
	QuestlineSettings,
	QuestlineSettingTab,
} from './settings';

export default class QuestlinePlugin extends Plugin {
	settings!: QuestlineSettings;
	private questline!: QuestlineIndexService;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new QuestlineSettingTab(this.app, this));

		this.questline = new QuestlineIndexService(createVaultReader(this.app), {
			timers: WINDOW_TIMERS,
		});
		this.registerIndexEvents();
		this.app.workspace.onLayoutReady(() => {
			void this.questline.refresh();
		});
	}

	onunload() {
		this.questline.destroy();
	}

	/** The cached index. Render paths read this and never rescan the vault. */
	getIndex(): QuestlineIndex {
		return this.questline.getIndex();
	}

	/** Subscribe to index rebuilds. Returns an unsubscribe function. */
	onIndexRefresh(listener: (index: QuestlineIndex) => void): () => void {
		return this.questline.onRefresh(listener);
	}

	private registerIndexEvents(): void {
		const refresh = () => {
			this.questline.scheduleRefresh();
		};

		this.registerEvent(this.app.metadataCache.on('changed', refresh));
		this.registerEvent(
			this.app.metadataCache.on('deleted', (file) => {
				this.questline.forget(file.path);
				refresh();
			}),
		);
		// The metadata cache has no create or rename event; Obsidian emits
		// those on the vault, and explicitly leaves renames off the cache.
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile && file.extension === 'md') refresh();
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.questline.forget(oldPath);
				if (file instanceof TFile && file.extension === 'md') refresh();
			}),
		);
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
