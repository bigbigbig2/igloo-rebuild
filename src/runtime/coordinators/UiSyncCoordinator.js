export class UiSyncCoordinator {
  constructor(controller) {
    this.controller = controller;
  }

  buildUiState() {
    const controller = this.controller;
    const activeSection = controller.homeSceneStack.getActiveSection();

    return {
      route: controller.route,
      project: controller.currentProject,
      hoveredProject: controller.hoveredProject,
      activeSectionKey: activeSection?.key ?? null,
      homeSectionProgress: controller.homeState?.localProgress ?? 0,
      iglooPresentation:
        controller.sections.igloo?.getPresentationState?.() ?? null,
      cubesPresentation:
        controller.sections.cubes?.getOverlayPresentation?.() ?? null,
      entryPresentation:
        controller.sections.entry?.getPresentationState?.() ?? null,
      detailUiProgress: controller.detailPhases.uiProgress,
      interactionLabel:
        controller.currentProject && controller.detailPhases.uiProgress > 0.08
          ? controller.content.closeLabel ?? 'Back Home'
          : activeSection?.key === 'entry'
            ? 'Hover or click a portal link, or scroll back through the reconstructed flow.'
            : controller.hoveredProject
              ? `${
                  controller.content.clickLabel ?? 'Click to explore'
                } ${controller.hoveredProject.title}`
              : controller.content.scrollLabel ??
                'Scroll or use arrow keys to move between reconstructed sections.',
      sectionLabel:
        controller.currentProject && controller.detailPhases.uiProgress > 0.35
          ? controller.currentProject.detailTitle ?? controller.currentProject.title
          : activeSection?.label ?? 'Project Detail'
    };
  }

  syncUi() {
    const controller = this.controller;
    const uiState = this.buildUiState();
    const useWebglUi =
      controller.webglUi?.isReadyForHero?.()
      && uiState.route.name === 'home'
      && ['igloo', 'cubes', 'entry'].includes(uiState.activeSectionKey)
      && !uiState.project;

    controller.ui.update({
      ...uiState,
      useWebglUi
    });

    controller.webglUi?.update({
      routeName: uiState.route.name,
      activeSectionKey: uiState.activeSectionKey,
      hasProject: Boolean(uiState.project),
      iglooPresentation: uiState.iglooPresentation,
      cubesPresentation: uiState.cubesPresentation,
      entryPresentation: uiState.entryPresentation,
      muted: controller.audio?.muted ?? controller.content.audio?.muted ?? true,
      brand: controller.content.brand,
      copyright: controller.content.manifesto.copyright,
      rights: controller.content.manifesto.rights,
      clickLabel: controller.content.clickLabel ?? 'Click to explore',
      manifestoLabel: uiState.iglooPresentation
        ? 'Manifesto'
        : controller.content.manifesto.title,
      manifestoText: controller.content.manifesto.text
    });
  }
}
