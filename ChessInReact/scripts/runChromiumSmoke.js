import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

export async function runChromiumWorkerSmokeTest() {
  const browserPath = CHROME_PATHS.find((p) => existsSync(p));
  if (!browserPath) {
    if (process.env.CI) {
      throw new Error(
        'Chromium smoke test gate failed: No Chromium executable found in CI environment! (Silent skip prohibited in CI)'
      );
    }
    console.warn('Skipping Chromium smoke test: No Chromium browser executable found on local dev system.');
    return {
      success: true,
      skipped: true,
      browserPath: null,
      browserVersion: null,
      result: 'SUCCESS: SKIPPED (No browser installed in local environment)',
    };
  }

  // Obtain browser version
  let browserVersion = 'unknown';
  try {
    const rawVer = execFileSync(browserPath, ['--version'], { encoding: 'utf8', timeout: 3000 });
    browserVersion = rawVer.trim();
  } catch {
    browserVersion = 'headless-chromium';
  }

  console.log(`[CHROMIUM SMOKE] Detected browser: "${browserPath}" (${browserVersion})`);

  const port = 5200 + Math.floor(Math.random() * 500);
  const cdpPort = 9300 + Math.floor(Math.random() * 500);

  let resultFromHttp = '';

  // 1. Start Vite server programmatically
  const viteServer = await createServer({
    server: { port, host: '127.0.0.1' },
    logLevel: 'error',
  });

  viteServer.middlewares.use('/__smoke_result', (req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c.toString();
    });
    req.on('end', () => {
      resultFromHttp = body;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });
  });

  await viteServer.listen();

  const url = `http://127.0.0.1:${port}/worker-smoke.html`;

  // 2. Launch real Chromium in headless mode
  const chromeProc = spawn(
    browserPath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      `--remote-debugging-port=${cdpPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      url,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );

  let chromeStderr = '';
  if (chromeProc.stderr) {
    chromeProc.stderr.on('data', (d) => {
      chromeStderr += d.toString();
    });
  }

  try {
    // 3. Poll for page result via HTTP callback (preferred) or CDP endpoint (fallback)
    const startTime = Date.now();
    let result = '';

    while (Date.now() - startTime < 18000) {
      if (resultFromHttp) {
        result = resultFromHttp;
        break;
      }

      await new Promise((r) => setTimeout(r, 200));

      if (resultFromHttp) {
        result = resultFromHttp;
        break;
      }

      try {
        const resp = await fetch(`http://127.0.0.1:${cdpPort}/json`);
        if (!resp.ok) continue;
        const targets = await resp.json();
        const pageTarget = targets.find((t) => t.url && t.url.includes('worker-smoke.html'));
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          // Send evaluate command via WebSocket
          const wsUrl = pageTarget.webSocketDebuggerUrl;
          const text = await new Promise((resolve, reject) => {
            const WebSocketImpl = globalThis.WebSocket;
            if (!WebSocketImpl) {
              reject(new Error('WebSocket not available in Node runtime'));
              return;
            }
            const ws = new WebSocketImpl(wsUrl);
            const reqId = 1;
            ws.onopen = () => {
              ws.send(
                JSON.stringify({
                  id: reqId,
                  method: 'Runtime.evaluate',
                  params: {
                    expression:
                      "document.getElementById('result') ? document.getElementById('result').textContent : ''",
                    returnByValue: true,
                  },
                })
              );
            };
            ws.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                if (data.id === reqId) {
                  ws.close();
                  resolve(data.result?.result?.value || '');
                }
              } catch (e) {
                ws.close();
                reject(e);
              }
            };
            ws.onerror = (e) => {
              ws.close();
              reject(e);
            };
          });

          if (typeof text === 'string' && text.length > 0) {
            result = text;
            if (result.startsWith('SUCCESS:')) {
              break;
            }
            if (result.startsWith('ERROR:')) {
              throw new Error(`Browser Web Worker failed with error: ${result}`);
            }
          }
        }
      } catch {
        // Retry next tick
      }
    }

    if (!result.startsWith('SUCCESS:')) {
      throw new Error(`Browser smoke test timed out or did not succeed. Last status: "${result}"`);
    }

    console.log(`[CHROMIUM SMOKE] Worker execution verified: ${result}`);

    return {
      success: true,
      skipped: false,
      browserPath,
      browserVersion,
      result,
    };
  } finally {
    try {
      chromeProc.kill();
    } catch {}
    await viteServer.close();
  }
}

// Allow standalone execution: node scripts/runChromiumSmoke.js
if (process.argv[1] && process.argv[1].endsWith('runChromiumSmoke.js')) {
  runChromiumWorkerSmokeTest()
    .then((res) => {
      console.log('CHROMIUM WEB WORKER SMOKE TEST PASSED:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('CHROMIUM WEB WORKER SMOKE TEST FAILED:', err);
      process.exit(1);
    });
}
