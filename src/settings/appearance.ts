import type { SettingDefinitionGroup } from 'obsidian';
import type { GoalProjectsStyle, ProgressBarStyle } from './types';
import { renderRow, type SettingsHost } from './ui';

/** Landing group: visual choices that do not affect the index. */
export function appearanceGroup(host: SettingsHost): SettingDefinitionGroup {
	const { plugin } = host;

	return {
		type: 'group',
		heading: 'Appearance',
		items: [
			renderRow(
				'Progress bar style',
				'Rainbow is a full-spectrum gradient. Multi-color uses hard-edged color blocks. Threshold changes color at 25%, 50%, and 75%. Accent color matches the theme.',
				(setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOption('rainbow', 'Rainbow')
							.addOption('multicolor', 'Multi-color')
							.addOption('threshold', 'Threshold')
							.addOption('normal', 'Accent color')
							.setValue(plugin.settings.progressBarStyle)
							.onChange((value) => {
								const progressBarStyle: ProgressBarStyle =
									value === 'multicolor'
										? 'multicolor'
										: value === 'threshold'
											? 'threshold'
											: value === 'normal'
												? 'normal'
												: 'rainbow';
								void plugin.updateSettings({
									progressBarStyle,
								});
							}),
					);
				},
			),
			renderRow(
				'Goal projects style',
				'Minimal keeps the bulleted list. Compact tightens each row. Table adds columns. Cards show each project with a bar. Dashboard adds stats and a detailed table.',
				(setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOption('minimal', 'Minimal')
							.addOption('compact', 'Compact')
							.addOption('table', 'Table')
							.addOption('cards', 'Cards')
							.addOption('dashboard', 'Dashboard')
							.setValue(plugin.settings.goalProjectsStyle)
							.onChange((value) => {
								const goalProjectsStyle: GoalProjectsStyle =
									value === 'compact'
										? 'compact'
										: value === 'table'
											? 'table'
											: value === 'cards'
												? 'cards'
												: value === 'dashboard'
													? 'dashboard'
													: 'minimal';
								void plugin.updateSettings({
									goalProjectsStyle,
								});
							}),
					);
				},
			),
		],
	};
}
