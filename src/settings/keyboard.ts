import type { SettingDefinitionGroup } from 'obsidian';
import { renderRow, type SettingsHost } from './ui';

/** Opt-in keyboard access for board views. */
export function keyboardGroup(host: SettingsHost): SettingDefinitionGroup {
	const { plugin } = host;

	return {
		type: 'group',
		heading: 'Keyboard and accessibility',
		items: [
			renderRow(
				'Skip controls to board',
				'When enabled, Tab from the top of a board view moves straight to the active card instead of stopping on the tabs, actions, and filters. Tab and Shift+Tab loop between board cards; Escape leaves the board.',
				(setting) => {
					setting.addToggle((toggle) =>
						toggle
							.setValue(plugin.settings.skipControlsToBoard)
							.onChange((value) => {
								void plugin.updateSettings({
									skipControlsToBoard: value,
								});
							}),
					);
				},
			),
		],
	};
}
