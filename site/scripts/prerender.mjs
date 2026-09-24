// Writes one static HTML file per route of the built site, so a deep link is served with a 200 and
// its own title and description, and a reader or a crawler that does not run JavaScript still gets the
// page. It renders the app with the server build in dist-ssr (`vite build --ssr`), and the browser
// hydrates the result. Unknown routes fall back to dist/404.html, the app shell without a page.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dist = path.resolve("dist");
const ssr = path.resolve("dist-ssr");
const shell = readFileSync(path.join(dist, "index.html"), "utf-8");
const { base, render, pages, siteName } = await import(pathToFileURL(path.join(ssr, "entry-server.js")).href);

const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function withHead(html, { title, description }) {
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escape(siteName)}" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(description)}" />`,
    `<meta name="twitter:card" content="summary" />`,
  ];
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escape(description)}" />`)
    .replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
}

// The shell has no page in it, and serves every route that has no file of its own.
writeFileSync(path.join(dist, "404.html"), shell);

for (const page of pages) {
  const html = await render(`${base}${page.route}`);
  const document = withHead(shell.replace('<div id="root"></div>', `<div id="root">${html}</div>`), page);
  const file = path.join(dist, page.route, "index.html");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, document);
}
rmSync(ssr, { recursive: true, force: true });
console.log(`prerendered ${pages.length} pages`);
