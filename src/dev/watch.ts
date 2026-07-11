/**
 * Development watch server for local CSS iteration.
 *
 * Watches `src/summarize/report.css` for changes, copies the latest
 * stylesheet into `reports/assets/report.css`, regenerates the reports
 * index page, then pushes a live-reload event to every connected browser.
 *
 * Usage: `pnpm watch`
 *
 * Opens a tiny static server on http://localhost:3000 serving the
 * `reports/` directory.  HTML responses are automatically injected with
 * a short SSE snippet that listens for reload events — no browser
 * extension needed.
 */
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, extname } from "node:path";
import { generateIndexPage } from "../summarize/html.js";

const PORT = 3000;
const REPORTS_DIR = join(process.cwd(), "reports");
const CSS_SOURCE = join(process.cwd(), "src", "summarize", "report.css");

// Track connected SSE clients so we can broadcast reload events.
const clients = new Set<ServerResponse>();

/**
 * Minimal live-reload snippet injected into HTML responses.
 *
 * Connects to the server's SSE endpoint and triggers a full page
 * reload whenever the server signals a file change.
 */
const LIVE_RELOAD_SNIPPET = `<script>
new EventSource('/__reload').addEventListener('reload',function(){window.location.reload()})
</script>`;

/**
 * Copy the source stylesheet and regenerate the index page,
 * then broadcast a reload event to every connected browser.
 */
async function refreshCss(): Promise<void> {
  try {
    const outPath = await generateIndexPage(REPORTS_DIR);
    console.log(`[watch] refreshed: ${outPath}`);
  } catch (err) {
    console.error(`[watch] refresh failed: ${(err as Error).message}`);
    return;
  }

  // Notify every connected browser to reload.
  for (const res of clients) {
    res.write("event: reload\ndata: css\n\n");
  }
}

/**
 * Map extension → MIME type for the tiny static server.
 */
function contentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    default:
      return "text/plain; charset=utf-8";
  }
}

/**
 * Serve a file from the reports directory, injecting the live-reload
 * snippet into HTML responses.
 */
async function serveFile(res: ServerResponse, filePath: string): Promise<void> {
  try {
    const data = await readFile(filePath);
    const ct = contentType(filePath);

    if (ct.startsWith("text/html")) {
      // Inject the live-reload snippet before </body> or </html>.
      let html = data.toString("utf8");
      const closing = html.lastIndexOf("</body>");
      if (closing !== -1) {
        html = html.slice(0, closing) + LIVE_RELOAD_SNIPPET + html.slice(closing);
      } else {
        html += LIVE_RELOAD_SNIPPET;
      }
      res.writeHead(200, { "Content-Type": ct });
      res.end(html);
    } else {
      res.writeHead(200, { "Content-Type": ct });
      res.end(data);
    }
  } catch {
    res.writeHead(404);
    res.end("Not found\n");
  }
}

/**
 * Handle an incoming HTTP request:
 * - /__reload   → SSE endpoint for live-reload
 * - /           → serve reports/index.html
 * - /file.path  → serve the corresponding file from reports/
 */
function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? "/";

  // SSE live-reload endpoint
  if (url === "/__reload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  // Route "/" → index.html, everything else → reports/<path>
  const relative = url === "/" ? "/index.html" : url;
  const filePath = join(REPORTS_DIR, relative);
  serveFile(res, filePath);
}

// ── Start watcher + server ────────────────────────────────────────────

// Initial CSS copy + page regeneration before serving
console.log("[watch] initial CSS refresh…");
await refreshCss();

// Watch the source CSS for changes
watch(CSS_SOURCE, async (eventType) => {
  if (eventType === "change") {
    console.log("[watch] CSS changed, refreshing…");
    await refreshCss();
  }
});

const server = createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`[watch] serving reports/ on http://localhost:${PORT}`);
  console.log(`[watch] watching ${CSS_SOURCE} for changes`);
});
