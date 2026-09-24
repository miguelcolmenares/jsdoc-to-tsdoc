import { BookOpen, Compass, Puzzle, Terminal, Users } from "lucide-react";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { CommandMenu } from "@/components/site/command-menu";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteShell } from "@/components/site/site-shell";
import { collections, meta } from "@/content";
import { site } from "@/site.config";

const Home = lazy(() => import("@/pages/home").then((m) => ({ default: m.Home })));
const CollectionIndex = lazy(() =>
  import("@/pages/collection-index").then((m) => ({ default: m.CollectionIndex })),
);
const ItemDetail = lazy(() => import("@/pages/item-detail").then((m) => ({ default: m.ItemDetail })));
const NotFound = lazy(() => import("@/pages/not-found").then((m) => ({ default: m.NotFound })));

const NAV_LINKS = collections.map((collection) => ({ to: `/${collection.id}`, label: collection.label }));
const COMMAND_ICONS = [Puzzle, Terminal, BookOpen, Compass, Users];

export default function App() {
  const repository = meta.repository || undefined;

  return (
    <SiteShell
      header={
        <SiteHeader
          name={meta.name}
          icon={site.icon}
          links={NAV_LINKS}
          repository={repository}
          search={
            <CommandMenu
              title={`Search ${meta.name}`}
              description="Jump to any page"
              placeholder="Search…"
              groups={collections.map((collection, index) => ({
                heading: collection.label,
                icon: COMMAND_ICONS[index % COMMAND_ICONS.length] ?? Puzzle,
                items: collection.items.map((item) => ({
                  label: item.name,
                  to: `/${collection.id}/${item.slug}`,
                })),
              }))}
            />
          }
        />
      }
      footer={
        <SiteFooter
          name={meta.name}
          icon={site.icon}
          description={meta.description}
          version={`${meta.name}@${meta.version}`}
          installCommand={meta.installCommand}
          columns={[{ title: "Catalog", links: NAV_LINKS }]}
          repository={repository}
        />
      }
    >
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/:collectionId" element={<CollectionIndex />} />
          <Route path="/:collectionId/:slug" element={<ItemDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </SiteShell>
  );
}
