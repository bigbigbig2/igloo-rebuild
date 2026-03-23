export class EntryInteractionCoordinator {
  constructor(controller) {
    this.controller = controller;
  }

  isEntryInteractive() {
    const controller = this.controller;

    if (!controller.ready || controller.route.name !== 'home') {
      return false;
    }

    if (
      controller.detailTransition.progress > 0.001
      || controller.detailTransition.target > 0.001
    ) {
      return false;
    }

    return controller.homeSceneStack.getActiveSection()?.key === 'entry';
  }

  previewEntryLink(index) {
    const controller = this.controller;

    if (!this.isEntryInteractive()) {
      return;
    }

    const changed =
      controller.sections.entry?.previewLink?.(index, {
        burstNoise: 0.72
      }) ?? false;

    if (!changed) {
      return;
    }

    controller.audio?.play('ui-short');
    controller.syncUi();
  }

  clearEntryLinkPreview() {
    const changed =
      this.controller.sections.entry?.clearPreviewLink?.({
        burstNoise: 0.35
      }) ?? false;

    if (changed) {
      this.controller.syncUi();
    }
  }

  activateEntryLink(index) {
    const controller = this.controller;

    if (!this.isEntryInteractive()) {
      return;
    }

    controller.sections.entry?.setAutoLinkIndex?.(index, { burstNoise: 1 });
    controller.audio?.play('ui-long');
    controller.syncUi();
  }

  visitEntryLink(index) {
    const controller = this.controller;

    if (!this.isEntryInteractive()) {
      return;
    }

    controller.sections.entry?.setAutoLinkIndex?.(index, { burstNoise: 0.75 });
    controller.audio?.play('ui-long');
    controller.syncUi();
  }

  cycleEntryLink(direction = 1) {
    const controller = this.controller;

    if (!this.isEntryInteractive()) {
      return;
    }

    const links = controller.sections.entry?.links ?? controller.content.links ?? [];

    if (!links.length) {
      return;
    }

    const currentIndex =
      controller.sections.entry?.autoLinkIndex ??
      controller.sections.entry?.activeLinkIndex ??
      0;
    const step = direction < 0 ? -1 : 1;
    const nextIndex = (currentIndex + step + links.length) % links.length;
    const changed =
      controller.sections.entry?.setAutoLinkIndex?.(nextIndex, {
        burstNoise: 1
      }) ?? false;

    if (!changed) {
      return;
    }

    controller.audio?.play('ui-long');
    controller.syncUi();
  }
}
