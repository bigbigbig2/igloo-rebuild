export class PointerCoordinator {
  constructor(controller) {
    this.controller = controller;
  }

  isCubesInteractive() {
    const controller = this.controller;

    if (!controller.ready || controller.route.name !== 'home') {
      return false;
    }

    if (
      controller.detailTransition.progress > 0.001
      || controller.detailTransition.target > 0
    ) {
      return false;
    }

    return controller.homeSceneStack.getActiveSection()?.key === 'cubes';
  }

  getNormalizedPointer(event) {
    const bounds =
      this.controller.engine.renderer.domElement.getBoundingClientRect();

    if (!bounds.width || !bounds.height) {
      return null;
    }

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      y: -(((event.clientY - bounds.top) / bounds.height) * 2 - 1)
    };
  }

  pickProjectHitFromEvent(event) {
    const controller = this.controller;

    if (!this.isCubesInteractive()) {
      controller.sections.cubes?.setPointerHit(null);
      return null;
    }

    return (
      controller.sections.cubes?.pickProjectHit(this.getNormalizedPointer(event)) ??
      null
    );
  }

  pickProjectFromEvent(event) {
    return this.pickProjectHitFromEvent(event)?.project ?? null;
  }

  setHoveredProject(project = null) {
    const controller = this.controller;
    const nextHash = project?.hash ?? null;

    if (controller.hoveredProject?.hash === nextHash) {
      return;
    }

    controller.hoveredProject = project;
    controller.sections.cubes?.setHoveredProject(nextHash);
    controller.engine.renderer.domElement.style.cursor = nextHash ? 'pointer' : '';
    controller.syncUi();
  }

  onPointerMove(event) {
    const controller = this.controller;
    const pointer = this.getNormalizedPointer(event);

    controller.sections.igloo?.setPointer(pointer);
    controller.sections.cubes?.setPointer(pointer);
    controller.sections.entry?.setPointer(pointer);

    const hit = this.pickProjectHitFromEvent(event);
    controller.sections.cubes?.setPointerHit(hit);
    this.setHoveredProject(hit?.project ?? null);
  }

  onPointerLeave() {
    const controller = this.controller;

    controller.sections.igloo?.setPointer(null);
    controller.sections.cubes?.setPointer(null);
    controller.sections.entry?.setPointer(null);
    controller.sections.cubes?.setPointerHit(null);
    this.setHoveredProject(null);
  }

  onPointerClick(event) {
    const project = this.pickProjectFromEvent(event);

    if (!project) {
      return;
    }

    event.preventDefault();
    this.controller.openProject(project.hash);
  }
}
