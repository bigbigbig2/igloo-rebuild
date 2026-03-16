export class RouteSync {
  constructor({ router, initialRoute = { name: 'home', params: {}, path: '/' } }) {
    this.router = router;
    this.currentRoute = initialRoute;
    this.listeners = new Set();
    this.handleRouteChange = this.handleRouteChange.bind(this);
    this.unsubscribe = this.router.onChange(this.handleRouteChange);
  }

  handleRouteChange(route) {
    this.currentRoute = route;
    this.listeners.forEach((listener) => listener(route));
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getRoute() {
    return this.currentRoute;
  }

  goHome(options) {
    this.router.go('/', options);
  }

  goProject(hash, options) {
    this.router.go(`/portfolio/${hash}`, options);
  }

  replaceHome() {
    this.goHome({ replace: true });
  }

  destroy() {
    this.unsubscribe?.();
    this.listeners.clear();
  }
}
