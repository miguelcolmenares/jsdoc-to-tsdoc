import { collections, type Collection, type Item, type Tone } from "@/content";

/** Finds a collection by its route id. */
export function findCollection(id: string | undefined): Collection | undefined {
  return collections.find((collection) => collection.id === id);
}

/** Tone of a group's chip and badge, `neutral` for an item without a group. */
export function groupTone(collection: Collection, item: Pick<Item, "group"> | string | undefined): Tone {
  const name = typeof item === "string" ? item : item?.group;
  return collection.groups?.find((group) => group.name === name)?.tone ?? "neutral";
}
