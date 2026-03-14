import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

function toCacheKey(group, key) {
  return `${group}:${key}`;
}

function loadWithLoader(loader, source) {
  return new Promise((resolve, reject) => {
    loader.load(source, resolve, undefined, reject);
  });
}

export class AssetRegistry {
  constructor(manifest, { bus } = {}) {
    this.manifest = manifest;
    this.bus = bus;
    this.cache = new Map();
    this.pending = new Map();
    this.failures = new Map();
    this.initialized = false;
    this.loadingManager = new THREE.LoadingManager();
    this.loadingManager.onError = (url) => {
      this.bus?.emit('assets:transfer-error', { url });
    };
  }

  async init(renderer) {
    if (this.initialized) {
      return;
    }

    this.renderer = renderer;
    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.pmremGenerator.compileEquirectangularShader();

    this.dracoLoader = new DRACOLoader(this.loadingManager);
    this.dracoLoader.setDecoderConfig({ type: 'wasm' });
    this.dracoLoader.setDecoderPath('/decoders/draco/');

    this.ktx2Loader = new KTX2Loader(this.loadingManager);
    this.ktx2Loader.setTranscoderPath('/decoders/basis/');
    this.ktx2Loader.detectSupport(renderer);

    this.exrLoader = new EXRLoader(this.loadingManager);
    this.initialized = true;
  }

  entries(groups = Object.keys(this.manifest)) {
    return groups.flatMap((group) => {
      return (this.manifest[group] ?? []).map((entry) => ({ group, entry }));
    });
  }

  list(group) {
    return this.manifest[group] ?? [];
  }

  listBySection(group, section) {
    return this.manifest[group]?.filter((entry) => entry.section === section) ?? [];
  }

  get(group, key) {
    return this.cache.get(toCacheKey(group, key)) ?? null;
  }

  has(group, key) {
    return this.cache.has(toCacheKey(group, key));
  }

  async preload(groups = ['geometry', 'texture']) {
    const entries = this.entries(groups);
    const total = entries.length;
    let loaded = 0;

    this.bus?.emit('assets:preload-start', { total });

    await Promise.all(entries.map(async ({ group, entry }) => {
      try {
        await this.load(group, entry.key);
      } catch (error) {
        const failure = {
          group,
          key: entry.key,
          source: entry.source,
          error
        };
        this.failures.set(toCacheKey(group, entry.key), failure);
        console.warn(`Asset load failed for ${group}/${entry.key}`, error);
      } finally {
        loaded += 1;
        this.bus?.emit('assets:progress', {
          loaded,
          total,
          group,
          key: entry.key
        });
      }
    }));

    const failures = Array.from(this.failures.values());
    this.bus?.emit('assets:ready', {
      total,
      loaded: total - failures.length,
      failures
    });

    return { total, failures };
  }

  async load(group, key) {
    const cacheKey = toCacheKey(group, key);

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.pending.has(cacheKey)) {
      return this.pending.get(cacheKey);
    }

    const entry = this.list(group).find((item) => item.key === key);

    if (!entry) {
      throw new Error(`Unknown asset ${group}/${key}`);
    }

    const pending = this.loadEntry(group, entry)
      .then((asset) => {
        this.cache.set(cacheKey, asset);
        this.pending.delete(cacheKey);
        return asset;
      })
      .catch((error) => {
        this.pending.delete(cacheKey);
        throw error;
      });

    this.pending.set(cacheKey, pending);
    return pending;
  }

  async loadEntry(group, entry) {
    if (!this.initialized && (group === 'geometry' || group === 'texture')) {
      throw new Error('AssetRegistry.init(renderer) must run before loading geometry or textures.');
    }

    if (group === 'geometry') {
      return this.loadGeometry(entry);
    }

    if (group === 'texture') {
      return this.loadTexture(entry);
    }

    return entry.source;
  }

  async loadGeometry(entry) {
    return loadWithLoader(this.dracoLoader, entry.source);
  }

  async loadTexture(entry) {
    if (entry.kind === 'exr-env') {
      const texture = await loadWithLoader(this.exrLoader, entry.source);
      texture.mapping = THREE.EquirectangularReflectionMapping;

      if (!this.pmremGenerator) {
        return texture;
      }

      const environment = this.pmremGenerator.fromEquirectangular(texture).texture;
      texture.dispose();
      return environment;
    }

    const texture = await loadWithLoader(this.ktx2Loader, entry.source);

    if (entry.colorSpace === 'srgb') {
      texture.colorSpace = THREE.SRGBColorSpace;
    }

    if (entry.wrap === 'repeat') {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
    }

    if (Array.isArray(entry.repeat) && entry.repeat.length === 2) {
      texture.repeat.set(entry.repeat[0], entry.repeat[1]);
    }

    return texture;
  }

  dispose() {
    this.cache.forEach((asset) => {
      asset?.dispose?.();
    });

    this.cache.clear();
    this.pending.clear();
    this.failures.clear();
    this.pmremGenerator?.dispose();
    this.dracoLoader?.dispose();
    this.ktx2Loader?.dispose();
  }
}
