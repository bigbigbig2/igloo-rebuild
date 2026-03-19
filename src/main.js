import './style.css';
import { EventBus } from './core/EventBus.js';
import { Router } from './core/Router.js';
import { Engine } from './core/Engine.js';
import { SiteController } from './controllers/SiteController.js';

const BOOT_LOADER_HIDE_DURATION_MS = 750;

const root = document.querySelector('#app');

root.innerHTML = `
  <div class="app-shell">
    <div class="viewport" data-canvas></div>
    <div class="overlay" data-ui></div>
    <div class="boot-loader" data-boot aria-live="polite" aria-busy="true">
      <div class="boot-loader__ascii" aria-hidden="true"></div>
      <span class="boot-loader__status" data-boot-label>Booting reverse-engineering workspace...</span>
    </div>
  </div>
`;

const canvasContainer = root.querySelector('[data-canvas]');
const uiContainer = root.querySelector('[data-ui]');
const bootLoader = root.querySelector('[data-boot]');
const bootLabel = root.querySelector('[data-boot-label]');

function setBootMessage(message) {
  if (!bootLoader) {
    return;
  }

  bootLoader.setAttribute('aria-label', message);

  if (bootLabel) {
    bootLabel.textContent = message;
  }
}

async function hideBootLoader() {
  if (!bootLoader) {
    return;
  }

  bootLoader.classList.add('is-hiding');
  bootLoader.setAttribute('aria-busy', 'false');

  await new Promise((resolve) => {
    let settled = false;

    const complete = () => {
      if (settled) {
        return;
      }

      settled = true;
      bootLoader.removeEventListener('transitionend', onTransitionEnd);
      resolve();
    };

    const onTransitionEnd = (event) => {
      if (event.target === bootLoader && event.propertyName === 'opacity') {
        complete();
      }
    };

    bootLoader.addEventListener('transitionend', onTransitionEnd);
    window.setTimeout(complete, BOOT_LOADER_HIDE_DURATION_MS + 120);
  });

  bootLoader.remove();
}

const bus = new EventBus();
const router = new Router({
  routes: [
    { path: '/', name: 'home' },
    { path: '/portfolio/:project', name: 'project' }
  ]
});
const engine = new Engine({
  container: canvasContainer,
  bus
});
const controller = new SiteController({
  bus,
  router,
  engine,
  uiContainer
});
let audioDebugGui = null;

bus.on('assets:preload-start', ({ total }) => {
  setBootMessage(`Loading reference assets 0/${total}...`);
});

bus.on('assets:progress', ({ loaded, total, group, key }) => {
  setBootMessage(`Loading reference assets ${loaded}/${total}: ${group}/${key}`);
});

async function bootstrap() {
  try {
    await controller.init();
    await hideBootLoader();
    router.start();
    window.controller = controller;
    window.__IGLOO_REBUILD__.audio = controller.audio;
    window.__IGLOO_REBUILD__.audioDebugGui = audioDebugGui;
  } catch (error) {
    console.error(error);
    if (bootLoader) {
      bootLoader.classList.add('is-error');
      bootLoader.setAttribute('aria-busy', 'false');
      bootLoader.innerHTML = '<div class="boot-loader__error">Boot failed. Check the console and asset paths.</div>';
    }
  }
}

bootstrap();

window.__IGLOO_REBUILD__ = {
  bus,
  router,
  engine,
  controller,
  audio: controller.audio,
  audioDebugGui
};
