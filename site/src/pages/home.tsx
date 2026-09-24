import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { CatalogCard } from "@/components/catalog/catalog-card";
import { Hero } from "@/components/catalog/hero";
import { Section } from "@/components/catalog/section";
import { SectionHeading } from "@/components/catalog/section-heading";
import { ToneBadge } from "@/components/catalog/tone-badge";
import { Button } from "@/components/ui/button";
import { collections, meta } from "@/content";
import { groupTone } from "@/lib/collections";

const FEATURED = 6;

export function Home() {
  const first = collections[0];

  return (
    <>
      <Hero
        eyebrow={`${meta.name}@${meta.version}`}
        title={meta.title ?? meta.name}
        description={meta.description}
        command={meta.installCommand}
        actions={
          first && (
            <Button asChild size="lg">
              <Link to={`/${first.id}`}>
                Browse the catalog <ArrowRight className="size-4" />
              </Link>
            </Button>
          )
        }
        stats={collections.slice(0, 4).map((collection) => ({
          label: collection.label,
          value: collection.items.length,
        }))}
      />

      {collections.map((collection, index) => (
        <Section key={collection.id} variant={index % 2 === 1 ? "alt" : "default"}>
          <SectionHeading
            index={String(index + 1).padStart(2, "0")}
            label={collection.label}
            title={`${collection.items.length} ${collection.label.toLowerCase()}`}
            {...(collection.description && { description: collection.description })}
            action={
              <Button asChild variant="outline">
                <Link to={`/${collection.id}`}>
                  View all <ArrowRight className="size-4" />
                </Link>
              </Button>
            }
          />
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collection.items.slice(0, FEATURED).map((item) => (
              <CatalogCard
                key={item.slug}
                to={`/${collection.id}/${item.slug}`}
                title={item.name}
                description={item.description}
                cta={`View ${collection.singular}`}
                breakTitle
                badge={
                  item.group && <ToneBadge tone={groupTone(collection, item)}>{item.group}</ToneBadge>
                }
                meta={
                  item.badges?.[0] && (
                    <ToneBadge tone={item.badges[0].tone ?? "neutral"} mono>
                      {item.badges[0].label}
                    </ToneBadge>
                  )
                }
              />
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}
