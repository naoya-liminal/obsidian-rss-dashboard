import { Modal, App, Setting } from "obsidian";

/** Batch saves of more than this many articles ask for confirmation first. */
export const BULK_SAVE_WARN_THRESHOLD = 50;

/**
 * Confirmation shown before a batch save that would create many notes at once.
 * Resolves `waitForClose()` with true only when the user confirms.
 */
export class BulkSaveWarnModal extends Modal {
  private count: number;
  private confirmed = false;
  private resolvePromise: ((confirmed: boolean) => void) | null = null;

  constructor(app: App, count: number) {
    super(app);
    this.count = count;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    new Setting(contentEl).setName("Save many articles?").setHeading();
    contentEl.createEl("p", {
      text: `You are about to save ${this.count} articles to your vault. This will create ${this.count} new notes.`,
    });

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.confirmed = false;
          this.close();
        }),
      )
      .addButton((b) =>
        b
          .setButtonText(`Save ${this.count} articles`)
          .setCta()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  onClose() {
    this.contentEl.empty();
    this.resolvePromise?.(this.confirmed);
  }

  waitForClose(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}
