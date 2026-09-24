import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// A built page carries the markup `scripts/prerender.mjs` rendered, which is hydrated. The 404 page
// and `npm run dev` start from an empty root and render on the client.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
