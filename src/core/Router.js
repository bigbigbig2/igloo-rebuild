function compileRoute(path) {
  if (path === '/') {
    return {
      path,
      keys: [],
      regexp: /^\/$/
    };
  }

  const keys = [];
  const pattern = path.replace(/:([^/]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });

  return {
    path,
    keys,
    regexp: new RegExp(`^${pattern}$`)
  };
}

export class Router {
  constructor({ routes = [] } = {}) {
    this.routes = routes.map((route) => ({
      ...route,
      ...compileRoute(route.path)
    }));
    this.listeners = new Set();
    this.handlePopState = this.handlePopState.bind(this);
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start() {
    window.addEventListener('popstate', this.handlePopState);
    this.notify(window.location.pathname);
  }

  stop() {
    window.removeEventListener('popstate', this.handlePopState);
  }

  go(path, { replace = false } = {}) {
    const current = window.location.pathname;
    if (current === path) {
      this.notify(path);
      return;
    }

    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', path);
    this.notify(path);
  }

  match(path) {
    const pathname = path || window.location.pathname;

    for (const route of this.routes) {
      const match = pathname.match(route.regexp);
      if (!match) {
        continue;
      }

      const params = route.keys.reduce((accumulator, key, index) => {
        accumulator[key] = decodeURIComponent(match[index + 1]);
        return accumulator;
      }, {});

      return {
        name: route.name,
        path: pathname,
        params
      };
    }

    return {
      name: 'not-found',
      path: pathname,
      params: {}
    };
  }

  handlePopState() {
    this.notify(window.location.pathname);
  }

  notify(path) {
    const match = this.match(path);
    this.listeners.forEach((listener) => listener(match));
  }
}
