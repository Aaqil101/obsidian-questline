import {
	Setting,
	SettingPage,
	type SettingDefinitionPage,
	type SettingDefinitionRender,
} from 'obsidian';
import type QuestlinePlugin from '../main';

/**
 * What a settings page may touch on the tab. Pages depend on this interface
 * rather than the tab class, so they never import the tab itself.
 */
export interface SettingsHost {
	readonly plugin: QuestlinePlugin;
	/** Re-render the view the caller is part of (landing tab or sub-page). */
	refresh(): void;
}

/**
 * A section heading plus a `.setting-items` card. Sub-pages are drawn
 * imperatively, so they use this helper instead of a declarative group.
 */
export function group(containerEl: HTMLElement, name: string): HTMLDivElement {
	const card = containerEl.createDiv({ cls: 'setting-group' });
	new Setting(card).setName(name).setHeading();

	return card.createDiv({ cls: 'setting-items' });
}

/** Muted paragraph inside a card, for prose that is not a setting row. */
export function noteParagraph(containerEl: HTMLElement, text: string): void {
	containerEl.createEl('p', {
		cls: 'setting-item-description questline-settings-note',
		text,
	});
}

/** How a sub-page module draws itself: a host plus the container to fill. */
export type PageRenderer = (
	host: SettingsHost,
	containerEl: HTMLElement,
) => void;

/**
 * One landing row as a declarative definition. The name and desc live on the
 * definition, which is what settings search indexes; the draw callback only
 * adds controls.
 */
export function renderRow(
	name: string,
	desc: string | undefined,
	draw: (setting: Setting) => void,
	visible?: () => boolean,
): SettingDefinitionRender {
	return {
		name,
		desc,
		visible,
		render: (setting) => {
			setting.setName(name);
			if (desc !== undefined) setting.setDesc(desc);
			draw(setting);
		},
	};
}

/**
 * An imperative sub-page hosted by the tab. The framework owns the title and
 * back navigation, so pages only fill their own container.
 */
class HostedPage extends SettingPage {
	private bound!: { host: SettingsHost; render: PageRenderer };

	bind(host: SettingsHost, render: PageRenderer): void {
		this.bound = {
			// Refresh inside a page repaints this page, not the whole tab.
			host: { plugin: host.plugin, refresh: () => this.display() },
			render,
		};
	}

	display(): void {
		this.containerEl.empty();
		this.bound.render(this.bound.host, this.containerEl);
	}
}

/** A navigable entry on the landing tab that opens an imperative sub-page. */
export function pageDefinition(
	host: SettingsHost,
	name: string,
	desc: string,
	render: PageRenderer,
): SettingDefinitionPage {
	return {
		type: 'page',
		name,
		desc,
		page: () => {
			const page = new HostedPage();
			page.title = name;
			page.bind(host, render);

			return page;
		},
	};
}
