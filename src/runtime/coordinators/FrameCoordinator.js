export class FrameCoordinator {
  constructor(controller) {
    this.controller = controller;
  }

  updateDetailState() {
    const controller = this.controller;

    controller.detailPhases = controller.detailTransition.getSnapshot();

    if (controller.currentProject) {
      if (
        controller.pendingProjectEnterAudio === controller.currentProject.hash
        && controller.detailPhases.sceneProgress >= 0.04
      ) {
        controller.audio?.play('enter-project');
        controller.pendingProjectEnterAudio = null;
      }

      if (
        controller.pendingProjectTextAudio === controller.currentProject.hash
        && controller.detailPhases.uiProgress >= 0.12
      ) {
        controller.audio?.play('project-text');
        controller.pendingProjectTextAudio = null;
      }
    } else {
      controller.pendingProjectEnterAudio = null;
      controller.pendingProjectTextAudio = null;
    }

    const detailAnchor = controller.currentProject
      ? controller.sections.cubes?.getDetailAnchor(controller.currentProject.hash) ?? null
      : null;

    controller.detailScene?.setHandoffAnchor(detailAnchor);
    controller.detailScene?.setTransitionProgress(
      controller.detailPhases.sceneProgress
    );
    controller.sections.cubes?.setDetailFocus(
      controller.currentProject?.hash ?? null,
      controller.detailPhases.focusProgress
    );
  }

  updateAudio(delta) {
    const controller = this.controller;
    const cubesAudioState = controller.sections.cubes?.getAudioState?.() ?? null;
    const entryAudioState = controller.sections.entry?.getAudioState?.() ?? null;

    controller.audio?.setTrackTargetMix(
      'shard',
      cubesAudioState?.shardMix ?? 0
    );
    controller.audio?.setTrackTargetMix(
      'particles',
      entryAudioState?.particlesMix ?? 0
    );

    const entryInteractionEnabled = Boolean(
      controller.route.name === 'home'
      && controller.homeState?.key === 'entry'
      && entryAudioState?.interactionEnabled
    );

    if (entryInteractionEnabled !== controller.entryInteractionAudioEnabled) {
      controller.entryInteractionAudioEnabled = entryInteractionEnabled;
      controller.audio?.play('ui-long');
    }

    controller.audio?.update(delta, {
      routeName: controller.route.name,
      activeSectionKey: controller.homeState?.key ?? null,
      hasProject: Boolean(controller.currentProject),
      detailUiProgress: controller.detailPhases.uiProgress
    });
  }

  finalizeAfterDetailClose(detailProgress) {
    const controller = this.controller;

    if (
      controller.route.name === 'home'
      && detailProgress < 0.001
      && controller.detailTransition.target === 0
    ) {
      controller.currentProject = null;
      controller.homeScrollSnapshot = null;
      controller.sections.cubes?.setDetailFocus(null, 0);
      controller.syncUi();
    }
  }

  onTick({ delta, elapsed }) {
    const controller = this.controller;

    if (!controller.ready) {
      return;
    }

    if (controller.route.name === 'home') {
      controller.scrollState.step(delta);
    }

    const detailProgress = controller.detailTransition.step(delta);
    this.updateDetailState();

    if (!controller.isCubesInteractive() && controller.hoveredProject) {
      controller.setHoveredProject(null);
    }

    controller.syncHomeScene();
    this.updateAudio(delta);
    controller.maybeAutoCenter(elapsed);

    if (
      controller.detailPhases.isOpen
      || (
        controller.route.name === 'home'
        && ['igloo', 'cubes', 'entry'].includes(controller.homeState?.key)
      )
    ) {
      controller.syncUi();
    }

    this.finalizeAfterDetailClose(detailProgress);
  }
}
