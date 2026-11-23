/** Confirmation before a created note takes a suffixed filename. */
import { Modal, Setting, type App } from 'obsidian';

/**
 * Ask whether to write at the suffixed path. Resolves false for Cancel, Esc,
 * or clicking outside, so the caller leaves the vault untouched.
 */
export function confirmCollision(
	app: App,
	requestedPath: string,
	newPath: string,
): Promise<boolean> {
	return new Promise((resolve) => {
		new CollisionModal(app, requestedPath, newPath, resolve).open();
	});
}

class CollisionModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly requestedPath: string,
		private readonly newPath: string,
		private readonly resolve: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.setTitle('A note with this name already exists');
		this.contentEl.createEl('p', {
			text: `${this.requestedPath} already exists.`,
		});
		this.contentEl.createEl('p', {
			text: `Create this goal as ${this.newPath} instead?`,
		});

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.finish(false)),
			)
			.addButton((button) =>
				button
					.setButtonText('Create with new name')
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
