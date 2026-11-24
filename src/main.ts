import { Plugin, TFile, TFolder } from 'obsidian';
import { QuestlineIndexService } from './index/service';
import { createVaultReader, WINDOW_TIMERS } from './index/source';
import type { QuestlineIndex } from './index/types';
import {
	DEFAULT_SETTINGS,
	QuestlineSettingTab,
	resolveConfig,
	type FolderKind,
	type QuestlineConfig,
	type QuestlineSettings,
} from './settings';
import { registerTemplateCommands } from './templates/commands';
import { registerCreationCommands } from './creation/commands';
import { registerDashboardView } from './views/dashboard';
import { registerProgressBlocks } from './views/blocks';
import {
	createStarterTemplates as writeStarterTemplates,
} from './templates/notes';
import type { StarterResult } from './templates/starter';

export default class QuestlinePlugin extends Plugin {
	settings!: QuestlineSettings;
	private config!: QuestlineConfig;
	private questline!: QuestlineIndexService;

	async onload() {
		await this.loadSettings();
		this.config = this.buildConfig();

		this.questline = new QuestlineIndexService(createVaultReader(this.app), {
			timers: WINDOW_TIMERS,
			config: this.config,
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new QuestlineSettingTab(this.app, this));

		registerTemplateCommands(this);
		registerCreationCommands(this);
		registerProgressBlocks(this);
		registerDashboardView(this);
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

	/** Validated settings shared by creation, the index, and the views. */
	getConfig(): QuestlineConfig {
		return this.config;
	}

	/** Persist a settings change and rebuild the index if it depends on it. */
	async updateSettings(patch: Partial<QuestlineSettings>): Promise<void> {
		const previous = this.getConfig();
		this.settings = { ...this.settings, ...patch };
		// Rebuild before saving, so a button clicked right after leaving an
		// input already reads the value that was just typed.
		this.config = this.buildConfig();
		const appearanceChanged =
			this.config.progressBarStyle !== previous.progressBarStyle ||
			this.config.goalProjectsStyle !== previous.goalProjectsStyle ||
			this.config.trackedTimeFormat !== previous.trackedTimeFormat ||
			this.config.useTimekeep !== previous.useTimekeep ||
			!sameList(this.config.goalCategories, previous.goalCategories);
		await this.saveSettings();

		if (await this.questline.setConfig(this.config)) {
			this.questline.scheduleRefresh();
		} else if (appearanceChanged) {
			this.questline.notifyRefresh();
		}
	}

	/** Subscribe to index rebuilds. Returns an unsubscribe function. */
	onIndexRefresh(listener: (index: QuestlineIndex) => void): () => void {
		return this.questline.onRefresh(listener);
	}

	/** Write the editable starter templates, or report the ones already there. */
	async createStarterTemplates(): Promise<StarterResult> {
		return writeStarterTemplates(this.app, this.config);
	}

	private buildConfig(): QuestlineConfig {
		return resolveConfig(this.settings, (path) => this.folderKind(path));
	}

	private folderKind(path: string): FolderKind {
		const entry = this.app.vault.getAbstractFileByPath(path);
		if (!entry) return 'missing';

		return entry instanceof TFolder ? 'folder' : 'file';
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
		const stored = (await this.loadData()) as Partial<QuestlineSettings> | null;

		this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/** Ordered list equality, for settings that only change how views paint. */
function sameList(left: readonly string[], right: readonly string[]): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}
