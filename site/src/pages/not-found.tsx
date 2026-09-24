import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTitle } from "@/lib/head";

export function NotFound() {
  useTitle("Page not found");
  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-32 text-center sm:px-6">
      <span className="font-mono text-sm text-muted-foreground">404</span>
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="max-w-md text-muted-foreground">That page doesn't exist. It may have been renamed when the catalog was regenerated.</p>
      <Button asChild>
        <Link to="/">Back home</Link>
      </Button>
    </div>
  );
}
