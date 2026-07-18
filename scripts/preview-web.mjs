import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, '..');
const distDirectory = join(projectDirectory, 'dist');
const basePath = '/laphiny/';
const host = process.env.LAPHINY_PREVIEW_HOST || '127.0.0.1';
const requestedPort = Number.parseInt(process.env.LAPHINY_PREVIEW_PORT || '8080', 10);
const shouldOpenBrowser = !process.argv.includes('--no-open')
  && process.env.LAPHINY_PREVIEW_NO_OPEN !== '1';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

if (!existsSync(join(distDirectory, 'index.html'))) {
  console.error('未找到 dist/index.html，请先运行 npm run web:build。');
  process.exit(1);
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || host}`);

  if (requestUrl.pathname === '/laphiny') {
    response.writeHead(302, { Location: basePath });
    response.end();
    return;
  }

  if (!requestUrl.pathname.startsWith(basePath)) {
    response.writeHead(302, { Location: basePath });
    response.end();
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestUrl.pathname.slice(basePath.length));
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  const requestedFile = resolve(distDirectory, decodedPath.replace(/^[/\\]+/, ''));
  const relativePath = relative(distDirectory, requestedFile);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || resolve(requestedFile) === resolve(distDirectory, '..')) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  let filePath = requestedFile;
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    const acceptsHtml = request.headers.accept?.includes('text/html');
    if (acceptsHtml && !extname(decodedPath)) {
      filePath = join(distDirectory, 'index.html');
    } else {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
  }

  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': contentTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
  };
  if (filePath === join(distDirectory, 'sw.js')) {
    headers['Service-Worker-Allowed'] = basePath;
  }

  response.writeHead(200, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

const port = await listenOnAvailablePort(requestedPort);
const previewUrl = `http://${host}:${port}${basePath}`;

console.log(`Laphiny Web 预览已启动：${previewUrl}`);
console.log('按 Ctrl+C 停止。');

if (shouldOpenBrowser) {
  openBrowser(previewUrl);
}

async function listenOnAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    try {
      await new Promise((resolvePromise, rejectPromise) => {
        const handleError = (error) => {
          server.off('listening', handleListening);
          rejectPromise(error);
        };
        const handleListening = () => {
          server.off('error', handleError);
          resolvePromise();
        };
        server.once('error', handleError);
        server.once('listening', handleListening);
        server.listen(port, host);
      });
      return port;
    } catch (error) {
      if (error?.code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error(`端口 ${startPort}-${startPort + 19} 均被占用。`);
}

function openBrowser(url) {
  const command = process.platform === 'win32'
    ? { executable: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] }
    : process.platform === 'darwin'
      ? { executable: 'open', args: [url] }
      : { executable: 'xdg-open', args: [url] };

  const child = spawn(command.executable, command.args, {
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', (error) => {
    console.warn(`无法自动打开浏览器，请手动访问 ${url}：${error.message}`);
  });
  child.unref();
}
