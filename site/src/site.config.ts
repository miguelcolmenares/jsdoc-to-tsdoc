import { Boxes } from "lucide-react";

// Site chrome that is not content. Name, version, description, repository and install command
// come from `docsite.config.json` and package.json through `docsite extract`, so they are
// read from `meta` in `@/content`, not repeated here.
export const site = {
  icon: Boxes,
};
