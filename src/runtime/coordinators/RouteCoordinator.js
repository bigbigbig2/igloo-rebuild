export class RouteCoordinator {
  constructor(controller) {
    this.controller = controller;
  }

  goHome() {
    this.controller.routeSync.goHome();
  }

  openProject(hash) {
    const controller = this.controller;
    const cubesScrollStart = controller.homeSceneStack.getScrollStartForKey('cubes');

    controller.audio?.play('click-project');
    controller.setHoveredProject(null);
    controller.homeScrollSnapshot = controller.scrollState.current;

    if (controller.homeSceneStack.getActiveSection()?.key !== 'cubes') {
      controller.scrollState.jumpTo(cubesScrollStart);
      controller.syncHomeScene();
    }

    controller.routeSync.goProject(hash);
  }

  handleRouteChange(route) {
    const controller = this.controller;

    if (!controller.ready) {
      controller.route = route;
      return;
    }

    const previousRoute = controller.route;
    const cubesScrollStart = controller.homeSceneStack.getScrollStartForKey('cubes');

    controller.route = route;

    if (route.name === 'project') {
      const project =
        controller.content.projects.find(
          (entry) => entry.hash === route.params.project
        ) ?? null;

      if (!project) {
        controller.routeSync.replaceHome();
        return;
      }

      controller.currentProject = project;
      controller.pendingProjectEnterAudio = project.hash;
      controller.pendingProjectTextAudio = project.hash;
      controller.setHoveredProject(null);

      if (controller.homeScrollSnapshot == null) {
        controller.homeScrollSnapshot = cubesScrollStart;
      }

      if (controller.homeSceneStack.getActiveSection()?.key !== 'cubes') {
        controller.scrollState.jumpTo(cubesScrollStart);
      }

      controller.detailScene.setProject(project);
      controller.detailTransition.open();
      controller.syncHomeScene();
    } else {
      if (previousRoute.name === 'project') {
        controller.audio?.play('leave-project');
        controller.pendingProjectEnterAudio = null;
        controller.pendingProjectTextAudio = null;
        controller.scrollState.jumpTo(
          controller.homeScrollSnapshot ?? cubesScrollStart
        );
      }

      controller.detailTransition.close();
      controller.syncHomeScene();
    }

    controller.syncUi();
  }
}
