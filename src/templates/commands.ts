import type QuestlinePlugin from '../main';
import { announceStarterError, announceStarterResult } from './notes';

/** Commands that write template files into the vault. */
export function registerTemplateCommands(plugin: QuestlinePlugin): void {
	plugin.addCommand({
		id: 'create-starter-templates',
		name: 'Create starter templates',
		callback: () => void writeStarterTemplates(plugin),
	});
}

async function writeStarterTemplates(plugin: QuestlinePlugin): Promise<void> {
	try {
		announceStarterResult(await plugin.createStarterTemplates());
	} catch (error) {
		announceStarterError(error);
	}
}
