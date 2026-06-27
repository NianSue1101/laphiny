import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const basePath = '/laphiny';

async function patchFile(path) {
  const original = await readFile(path, 'utf8');
  const patched = original
    .replaceAll('/_expo', `${basePath}/_expo`)
    .replaceAll('/favicon.ico', `${basePath}/favicon.ico`)
    .replaceAll('"/assets/', `"${basePath}/assets/`)
    .replaceAll("'/assets/", `'${basePath}/assets/`)
    .replaceAll('\\"/assets/', `\\"${basePath}/assets/`)
    .replaceAll("\\'/assets/", `\\'${basePath}/assets/`)
    .replaceAll('url(/assets/', `url(${basePath}/assets/`);

  if (patched !== original) {
    await writeFile(path, patched);
  }
}

await patchFile(join('dist', 'index.html'));

const bundleDir = join('dist', '_expo', 'static', 'js', 'web');
const bundleNames = await readdir(bundleDir);
await Promise.all(
  bundleNames
    .filter((name) => name.endsWith('.js'))
    .map((name) => patchFile(join(bundleDir, name)))
);

console.log('paths fixed');
