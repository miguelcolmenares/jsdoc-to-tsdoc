import { useEffect } from "react";
import { collections, meta } from "@/content";

/** The title and description of one page of the site. */
export interface PageHead {
  title: string;
  description: string;
}

/** Every page of the site by its route without the base path (`""`, `docs`, `docs/convert`). */
export const pages: (PageHead & { route: string })[] = [
  { route: "", title: meta.title ?? meta.name, description: meta.description },
  ...collections.flatMap((collection) => [
    {
      route: collection.id,
      title: `${collection.label} · ${meta.name}`,
      description: collection.description || meta.description,
    },
    ...collection.items.map((item) => ({
      route: `${collection.id}/${item.slug}`,
      title: `${item.name} · ${meta.name}`,
      description: item.description || meta.description,
    })),
  ]),
];

/** Sets the browser tab's title to the one of a page, so a client-side navigation keeps it current. */
export function usePageTitle(route: string): void {
  const title = pages.find((page) => page.route === route)?.title;
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}

/** Sets the title of a page that is not in `pages`, such as the 404. */
export function useTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · ${meta.name}`;
  }, [title]);
}
