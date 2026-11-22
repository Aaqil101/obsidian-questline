import type { SettingDefinitionGroup } from 'obsidian';
import { renderRow, type SettingsHost } from './ui';

/** Landing group: work hours are a single switch, so they stay on the tab. */
export function timeGroup(host: SettingsHost): SettingDefinitionGroup {
	const { plugin } = host;

	return {
		type: 'group',
		heading: 'Time',
		items: [
			renderRow(
				'Include timekeep work hours',
				'Read timekeep blocks and roll their work hours up with progress.',
				(setting) => {
					setting.addToggle((toggle) =>
						toggle
							.setValue(plugin.settings.useTimekeep)
							.onChange((value) => {
								void plugin.updateSettings({ useTimekeep: value });
							}),
					);
				},
			),
		],
	};
}
