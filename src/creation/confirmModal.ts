/** Confirmation before a note takes a suffixed filename. */
import { Modal, Setting, type App } from 'obsidian';

interface CollisionCopy {
	lead: string;
	question: string;
	action: string;
}

/**
 * Ask whether to write at the suffixed path. Resolves false for Cancel, Esc,
 * or clicking outside, so the caller leaves the vault untouched.
 */
export function confirmCollision(
	app: App,
	requestedPath: string,
	newPath: string,
): Promise<boolean> {
	return confirmSuffix(app, {
		lead: `${requestedPath} already exists.`,
		question: `Create this goal as ${newPath} instead?`,
		action: 'Create with new name',
	});
}

/** The same prompt when an edit rename runs into an existing note. */
export function confirmRenameCollision(
	app: App,
	requestedPath: string,
	newPath: string,
): Promise<boolean> {
	return confirmSuffix(app, {
		lead: `${requestedPath} already exists.`,
		question: `Rename this note as ${newPath} instead?`,
		action: 'Rename with new name',
	});
}

function confirmSuffix(app: App, copy: CollisionCopy): Promise<boolean> {
	return new Promise((resolve) => {
		new CollisionModal(app, copy, resolve).open();
	});
}

class CollisionModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly copy: CollisionCopy,
		private readonly resolve: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.setTitle('A note with this name already exists');
		this.contentEl.createEl('p', { text: this.copy.lead });
		this.contentEl.createEl('p', { text: this.copy.question });

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.finish(false)),
			)
			.addButton((button) =>
				button
					.setButtonText(this.copy.action)
					.setCta()
					.onClick(() => this.finish(true)),
			);
	}

	onClose(): void {
		this.contentEl.empty();
		this.finish(false);
	}

	private finish(confirmed: boolean): void {
		if (this.settled) return;

		this.settled = true;
		this.close();
		this.resolve(confirmed);
	}
}
