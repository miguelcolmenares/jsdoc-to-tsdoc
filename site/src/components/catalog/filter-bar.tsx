import { ToneBadge } from "@/components/catalog/tone-badge";
import { Input } from "@/components/ui/input";
import type { BadgeTone } from "@/lib/tone";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label?: string;
  tone: BadgeTone;
}

interface FilterBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder: string;
  options: FilterOption[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function FilterBar({
  query,
  onQueryChange,
  placeholder,
  options,
  value,
  onValueChange,
  className,
}: FilterBarProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <Input
        placeholder={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className="max-w-xs"
      />
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={option.value} type="button" onClick={() => onValueChange(option.value)}>
            <ToneBadge
              tone={option.tone}
              className={cn("cursor-pointer transition", value === option.value ? "opacity-100" : "opacity-50 hover:opacity-80")}
            >
              {option.label ?? option.value}
            </ToneBadge>
          </button>
        ))}
      </div>
    </div>
  );
}
