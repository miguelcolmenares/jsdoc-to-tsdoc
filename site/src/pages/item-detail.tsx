import { Navigate, useParams } from "react-router-dom";
import { DetailLayout } from "@/components/catalog/detail-layout";
import { Markdown } from "@/components/catalog/markdown";
import { MetaCard } from "@/components/catalog/meta-card";
import { SchemaTable } from "@/components/catalog/schema-table";
import { ToneBadge } from "@/components/catalog/tone-badge";
import { findCollection, groupTone } from "@/lib/collections";
import { usePageTitle } from "@/lib/head";

export function ItemDetail() {
  const { collectionId, slug } = useParams();
  const collection = findCollection(collectionId);
  const item = collection?.items.find((entry) => entry.slug === slug);
  usePageTitle(`${collectionId}/${slug}`);

  if (!collection) return <Navigate to="/" replace />;
  if (!item) return <Navigate to={`/${collection.id}`} replace />;

  const entries = Object.entries(item.meta ?? {}).filter(([, value]) => value !== null);
  const badges = [
    ...(item.group ? [{ label: item.group, tone: groupTone(collection, item) }] : []),
    ...(item.badges ?? []),
  ];

  return (
    <DetailLayout
      badge={
        badges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <ToneBadge key={badge.label} tone={badge.tone ?? "neutral"}>
                {badge.label}
              </ToneBadge>
            ))}
          </div>
        )
      }
      title={item.name}
      description={item.description}
      aside={
        <MetaCard title="Metadata">
          <dl className="space-y-3">
            <div>
              <dt className="text-muted-foreground">Slug</dt>
              <dd className="font-mono break-all">{item.slug}</dd>
            </div>
            {entries.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono break-all">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </MetaCard>
      }
    >
      {item.params && (
        <div className="mb-10">
          <h2 className="mb-4 font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Parameters
          </h2>
          <SchemaTable schema={item.params} />
        </div>
      )}
      {item.body && <Markdown>{item.body}</Markdown>}
    </DetailLayout>
  );
}
