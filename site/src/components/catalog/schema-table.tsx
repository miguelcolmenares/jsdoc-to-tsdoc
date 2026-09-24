import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface SchemaProperty {
  type?: string | string[];
  enum?: unknown[];
  items?: { type?: string | string[] };
  format?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
}

export interface SchemaObject {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

function formatType(prop: Pick<SchemaProperty, "type" | "enum" | "items">): string {
  if (prop.enum) return prop.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (Array.isArray(prop.type)) return prop.type.join(" | ");
  if (prop.type === "array" && prop.items) return `${formatType(prop.items)}[]`;
  return prop.type ?? "any";
}

export function SchemaTable({ schema }: { schema: SchemaObject }) {
  const properties = Object.entries(schema.properties ?? {});
  const required = new Set(schema.required ?? []);

  if (properties.length === 0) {
    return <p className="text-sm text-muted-foreground">No parameters.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Parameter</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Required</TableHead>
          <TableHead>Description</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {properties.map(([name, prop]) => (
          <TableRow key={name}>
            <TableCell className="font-mono whitespace-nowrap">{name}</TableCell>
            <TableCell className="font-mono text-xs whitespace-normal text-muted-foreground">
              {formatType(prop)}
              {prop.format && <span className="ml-1 opacity-70">({prop.format})</span>}
            </TableCell>
            <TableCell>{required.has(name) ? "Yes" : "—"}</TableCell>
            <TableCell className="max-w-md text-wrap text-muted-foreground">
              {prop.description ?? "—"}
              {prop.default !== undefined && (
                <span className="mt-1 block font-mono text-xs opacity-70">default: {JSON.stringify(prop.default)}</span>
              )}
              {(prop.minimum !== undefined || prop.maximum !== undefined) && (
                <span className="mt-1 block font-mono text-xs opacity-70">
                  range: {prop.minimum ?? "−∞"}–{prop.maximum ?? "∞"}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
