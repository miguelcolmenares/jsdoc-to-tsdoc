import { StrictMode } from "react";
import { prerender } from "react-dom/static";
import { StaticRouter } from "react-router-dom";
import App from "./App.tsx";
import { pages } from "./lib/head.ts";
import { meta } from "./content/index.ts";

export { pages };

/** The site name, for the `og:site_name` tag. */
export const siteName = meta.name;

/** The router's base path, as the client was built with it. */
export const base = import.meta.env.BASE_URL;

/**
 * Renders the app for one URL to an HTML string, waiting for every lazy page, so `scripts/prerender.mjs`
 * can write it into the built page.
 *
 * @param url - The path to render, including the base path.
 */
export async function render(url: string): Promise<string> {
  const { prelude } = await prerender(
    <StrictMode>
      <StaticRouter location={url} basename={base}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
  return new Response(prelude).text();
}
