import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface CommandMenuItem {
  label: string;
  to: string;
}

export interface CommandMenuGroup {
  heading: string;
  icon: LucideIcon;
  items: CommandMenuItem[];
}

interface CommandMenuProps {
  /** Dialog title, announced to screen readers. */
  title: string;
  description: string;
  placeholder: string;
  groups: CommandMenuGroup[];
}

export function CommandMenu({ title, description, placeholder, groups }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full max-w-56 items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-muted-foreground transition hover:border-white/20 hover:text-foreground"
      >
        <span>Search…</span>
        <kbd className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title={title} description={description}>
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {groups.map(({ heading, icon: Icon, items }) => (
              <CommandGroup key={heading} heading={heading}>
                {items.map((item) => (
                  <CommandItem key={`${item.to}:${item.label}`} onSelect={() => go(item.to)}>
                    <Icon className="size-4" />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
