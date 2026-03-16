import './style.css';
import { EventBus } from './core/EventBus.js';
import { Router } from './core/Router.js';
import { Engine } from './core/Engine.js';
import { SiteController } from './controllers/SiteController.js';
import { AudioDebugGui } from './debug/AudioDebugGui.js';

const root = document.querySelector('#app');

root.innerHTML = `
  <div class="app-shell">
    <div class="viewport" data-canvas></div>
    <div class="overlay" data-ui></div>
    <div class="boot-status" data-boot>Booting reverse-engineering workspace...</div>
  </div>
`;

const canvasContainer = root.querySelector('[data-canvas]');
const uiContainer = root.querySelector('[data-ui]');
const bootStatus = root.querySelector('[data-boot]');

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
  bootStatus.textContent = `Loading reference assets 0/${total}...`;
});

bus.on('assets:progress', ({ loaded, total, group, key }) => {
  bootStatus.textContent = `Loading reference assets ${loaded}/${total}: ${group}/${key}`;
});

async function bootstrap() {
  try {
    await controller.init();
    audioDebugGui = new AudioDebugGui({ controller });
    bootStatus.remove();
    router.start();
    window.__IGLOO_REBUILD__.audio = controller.audio;
    window.__IGLOO_REBUILD__.audioDebugGui = audioDebugGui;
  } catch (error) {
    console.error(error);
    bootStatus.textContent = 'Boot failed. Check the console and asset paths.';
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
