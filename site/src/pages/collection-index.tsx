import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CatalogCard } from "@/components/catalog/catalog-card";
import { FilterBar } from "@/components/catalog/filter-bar";
import { PageHeader } from "@/components/catalog/page-header";
import { ToneBadge } from "@/components/catalog/tone-badge";
import { findCollection, groupTone } from "@/lib/collections";
import { NotFound } from "@/pages/not-found";

export function CollectionIndex() {
  const { collectionId } = useParams();
  const collection = findCollection(collectionId);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");

  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return (collection?.items ?? []).filter(
      (item) =>
        (group === "All" || item.group === group) &&
        (!needle ||
          item.name.toLowerCase().includes(needle) ||
          item.description.toLowerCase().includes(needle)),
    );
  }, [collection, query, group]);

  if (!collection) return <NotFound />;

  const options = [
    { value: "All", tone: "neutral" as const },
    ...(collection.groups ?? []).map((entry) => ({ value: entry.name, tone: entry.tone })),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <PageHeader
        eyebrow={collection.label}
        title={`${collection.items.length} ${collection.label.toLowerCase()}`}
        description={collection.description}
      />
      <FilterBar
        className="mt-8"
        query={query}
        onQueryChange={setQuery}
        placeholder={`Search ${collection.label.toLowerCase()}…`}
        options={options.length > 1 ? options : []}
        value={group}
        onValueChange={setGroup}
      />
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <CatalogCard
            key={item.slug}
            to={`/${collection.id}/${item.slug}`}
            title={item.name}
            description={item.description}
            cta={`View ${collection.singular}`}
            breakTitle
            badge={item.group && <ToneBadge tone={groupTone(collection, item)}>{item.group}</ToneBadge>}
            meta={
              item.badges?.[0] && (
                <ToneBadge tone={item.badges[0].tone ?? "neutral"} mono>
                  {item.badges[0].label}
                </ToneBadge>
              )
            }
          />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-16 text-center text-muted-foreground">
            No {collection.label.toLowerCase()} match “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
