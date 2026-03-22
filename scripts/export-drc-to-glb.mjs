import http from 'node:http';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

import { assetManifest } from '../src/content/assetManifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.resolve(projectRoot, 'recovered-assets', 'drc-glb');
const exporterPagePath = path.resolve(projectRoot, 'tools', 'drc-exporter.html');

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.drc', 'application/octet-stream'],
  ['.glb', 'model/gltf-binary']
]);

function getBrowserExecutablePath() {
  const candidates = [
    process.env.BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);

  return candidates.find((candidate) => {
    return existsSync(candidate);
  }) ?? null;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeRelativeAssetPath(source) {
  return source
    .replace(/^\/reference-assets\//, '')
    .replace(/\.drc$/i, '.glb');
}

function createGeometryTasks() {
  return assetManifest.geometry
    .filter((entry) => entry.source.toLowerCase().endsWith('.drc'))
    .map((entry) => ({
      key: entry.key,
      section: entry.section,
      source: entry.source,
      dracoAttributes: entry.dracoAttributes ?? null,
      dracoAttributeTypes: entry.dracoAttributeTypes ?? null,
      outputRelativePath: normalizeRelativeAssetPath(entry.source)
    }));
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolveRequestPath(urlPathname) {
  if (urlPathname === '/' || urlPathname === '/tools/drc-exporter.html') {
    return exporterPagePath;
  }

  const decodedPath = decodeURIComponent(urlPathname);

  if (decodedPath.startsWith('/node_modules/')) {
    return path.join(projectRoot, decodedPath.slice(1));
  }

  if (decodedPath.startsWith('/reference-assets/') || decodedPath.startsWith('/decoders/')) {
    return path.join(projectRoot, 'public', decodedPath.slice(1));
  }

  return null;
}

async function createStaticServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const filePath = resolveRequestPath(requestUrl.pathname);

      if (!filePath) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      const normalizedPath = path.normalize(filePath);
      const allowedRoots = [
        path.resolve(projectRoot, 'public'),
        path.resolve(projectRoot, 'node_modules'),
        path.resolve(projectRoot, 'tools')
      ];

      const isAllowed = allowedRoots.some((allowedRoot) => {
        return normalizedPath === allowedRoot || isPathInside(allowedRoot, normalizedPath);
      });

      if (!isAllowed || !(await pathExists(normalizedPath))) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      const extension = path.extname(normalizedPath).toLowerCase();
      const content = await fs.readFile(normalizedPath);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES.get(extension) ?? 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      response.end(content);
    } catch (error) {
      response.writeHead(500, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      response.end(String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;

  if (port == null) {
    throw new Error('Failed to start exporter server.');
  }

  return {
    server,
    origin: `http://127.0.0.1:${port}`
  };
}

async function writeBase64Glb(outputPath, base64) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, Buffer.from(base64, 'base64'));
}

async function main() {
  const browserExecutablePath = getBrowserExecutablePath();

  if (!browserExecutablePath) {
    throw new Error('Could not find Chrome or Edge. Set BROWSER_PATH to continue.');
  }

  const tasks = createGeometryTasks();
  const report = {
    generatedAt: new Date().toISOString(),
    browserExecutablePath,
    outputRoot,
    totals: {
      total: tasks.length,
      exported: 0,
      skipped: 0,
      failed: 0
    },
    exported: [],
    skipped: [],
    failed: []
  };

  await fs.mkdir(outputRoot, { recursive: true });

  const { server, origin } = await createStaticServer();
  let browser;

  try {
    browser = await chromium.launch({
      executablePath: browserExecutablePath,
      headless: true,
      args: [
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist'
      ]
    });

    const page = await browser.newPage({
      viewport: {
        width: 64,
        height: 64
      }
    });

    page.on('console', (message) => {
      console.log(`[browser:${message.type()}] ${message.text()}`);
    });
    page.on('pageerror', (error) => {
      console.log(`[browser:pageerror] ${error.message}`);
    });
    page.on('requestfailed', (request) => {
      console.log(`[browser:requestfailed] ${request.url()} -> ${request.failure()?.errorText ?? 'unknown'}`);
    });

    await page.goto(`${origin}/tools/drc-exporter.html`, {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForFunction(() => window.__drcExporterReady === true);

    for (const task of tasks) {
      const outputPath = path.join(outputRoot, task.outputRelativePath);
      console.log(`[export] ${task.key}`);

      const result = await page.evaluate(async (pageTask) => {
        return await window.__exportDrcToGlb(pageTask);
      }, task);

      if (result.status === 'exported') {
        await writeBase64Glb(outputPath, result.base64);
        report.totals.exported += 1;
        report.exported.push({
          key: task.key,
          section: task.section,
          source: task.source,
          output: path.relative(projectRoot, outputPath),
          objectType: result.objectType,
          vertexCount: result.vertexCount,
          indexed: result.indexed,
          indexCount: result.indexCount,
          attributes: result.attributes,
          customAttributes: result.customAttributes,
          byteLength: result.byteLength
        });
        continue;
      }

      if (result.status === 'skipped') {
        report.totals.skipped += 1;
        report.skipped.push({
          key: task.key,
          source: task.source,
          reason: result.reason ?? 'unknown'
        });
        console.log(`[skip] ${task.key} -> ${result.reason ?? 'unknown'}`);
        continue;
      }

      report.totals.failed += 1;
      report.failed.push({
        key: task.key,
        source: task.source,
        error: result.error ?? 'Unknown export error'
      });
      console.log(`[fail] ${task.key} -> ${result.error ?? 'unknown error'}`);
    }
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await fs.writeFile(
    path.join(outputRoot, '_report.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );

  console.log('');
  console.log(`Exported: ${report.totals.exported}`);
  console.log(`Skipped:  ${report.totals.skipped}`);
  console.log(`Failed:   ${report.totals.failed}`);
  console.log(`Output:   ${outputRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
