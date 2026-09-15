import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface MultiSelectProps {
  options: readonly string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  function toggle(option: string) {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className,
          )}
        >
          {value.length === 0 ? (
            <span className="text-muted-foreground flex-1 text-left">{placeholder}</span>
          ) : (
            value.map((v) => (
              <Badge
                key={v}
                variant="secondary"
                className="gap-1 pr-1 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(v);
                }}
              >
                {v}
                <X className="h-3 w-3 cursor-pointer" />
              </Badge>
            ))
          )}
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="grid grid-cols-2 gap-1 max-h-64 overflow-y-auto">
          {options.map((option) => {
            const selected = value.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggle(option)}
                className={cn(
                  "rounded px-2 py-1.5 text-xs text-left transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
