import type { SettingDefinitionGroup } from 'obsidian';
import type {
	DashboardStyle,
	GoalProjectsStyle,
	GoalsStyle,
	ProgressBarStyle,
	ProjectsStyle,
	TrackedTimeFormat,
} from './types';
import { renderRow, type SettingsHost } from './ui';

/** Landing group: visual choices that do not affect the index. */
export function appearanceGroup(host: SettingsHost): SettingDefinitionGroup {
	const { plugin } = host;

	return {
		type: 'group',
		heading: 'Appearance',
		items: [
			renderRow(
				'Dashboard style',
				'Minimal uses compact tables. Cards shows goals and projects as cards with a hero and stats. Timeline orders goals by due date.',
				(setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOption('minimal', 'Minimal')
							.addOption('cards', 'Cards')
							.addOption('timeline', 'Timeline')
							.setValue(plugin.settings.dashboardStyle)
							.onChange((value) => {
								const dashboardStyle: DashboardStyle =
									value === 'cards' || value === 'timeline'
										? value
										: 'minimal';
								void plugin.updateSettings({
									dashboardStyle,
								});
							}),
					);
				},
			),
			renderRow(
				'Goals style',
				'List shows goals in a sortable table. Cards groups goals by category when sorting by category. Board shows goals in category lanes.',
				(setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOption('list', 'List')
							.addOption('cards', 'Cards')
							.addOption('board', 'Board')
							.setValue(plugin.settings.goalsStyle)
							.onChange((value) => {
								const goalsStyle: GoalsStyle =
									value === 'cards'
										? 'cards'
										: value === 'board'
											? 'board'
											: 'list';
								void plugin.updateSettings({
									goalsStyle,
								});
							}),
					);
				},
			),
			renderRow(
				'Projects style',
				'Table shows every project in sortable columns. Cards shows a filtered and sorted grid. Board shows projects in status lanes.',
				(setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOption('table', 'Table')
							.addOption('cards', 'Cards')
							.addOption('board', 'Board')
							.setValue(plugin.settings.projectsStyle)
							.onChange((value) => {
								const projectsStyle: ProjectsStyle =
									value === 'cards'
										? 'cards'
										: value === 'board'
											? 'board'
											: 'table';
								void plugin.updateSettings({
									projectsStyle,
								});
							}),
					);
				},
			),
			renderRow(
				'Progress bar style',
				'Spectrum is a smooth full-color gradient. Multi-color uses hard-edged color blocks. Threshold changes color at 25%, 50%, and 75%. Accent color matches the theme.',
				(setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOption('rainbow', 'Spectrum')
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
			renderRow(
				'Tracked time format',
				'Readable shows hours and minutes, such as 2h 30m. Decimal shows 2.50h.',
				(setting) => {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOption('readable', 'Readable')
							.addOption('decimal', 'Decimal')
							.setValue(plugin.settings.trackedTimeFormat)
							.onChange((value) => {
								const trackedTimeFormat: TrackedTimeFormat =
									value === 'readable' ? 'readable' : 'decimal';
								void plugin.updateSettings({
									trackedTimeFormat,
								});
							}),
					);
				},
			),
		],
	};
}
