export class HomeSceneCoordinator {
  constructor(controller) {
    this.controller = controller;
  }

  syncHomeScene() {
    const controller = this.controller;
    const result = controller.homeSceneStack.sync(controller.scrollState.current);

    controller.homeState = result;

    if (controller.homeRenderer) {
      controller.homeRenderer.setRenderState({
        ...result,
        detailScene: controller.detailScene,
        cubesScene: controller.sections.cubes,
        detailBlend: controller.detailPhases.overlayProgress,
        detailSceneBlend: controller.detailPhases.sceneProgress,
        scrollVelocity: controller.scrollState.velocity
      });
      controller.engine.setView(controller.homeRenderer);
    }

    if (result.changed) {
      controller.syncUi();
    }
  }
}
