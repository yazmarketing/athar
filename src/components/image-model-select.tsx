"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  IMAGE_MODEL_CHOICES,
  imageModelChoice,
  type ImageModelChoice,
} from "@/config/models";

type Props = {
  /** Choice id — see IMAGE_MODEL_CHOICES. */
  value: string;
  onChange: (id: string, choice: ImageModelChoice) => void;
  /** Narrow the list (e.g. drop models a surface can't drive). */
  filter?: (choice: ImageModelChoice) => boolean;
  className?: string;
  disabled?: boolean;
};

/**
 * The image-model picker, everywhere.
 *
 * Every surface that chooses a still model renders this, so the list can
 * never drift between the dock, variations and the chat composer — a model
 * added to IMAGE_MODEL_CHOICES shows up in all three at once.
 */
export function ImageModelSelect({
  value,
  onChange,
  filter,
  className,
  disabled,
}: Props) {
  const choices = filter
    ? IMAGE_MODEL_CHOICES.filter(filter)
    : IMAGE_MODEL_CHOICES;
  const selected = imageModelChoice(value);

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const choice = imageModelChoice(next);
        if (choice) onChange(next, choice);
      }}
    >
      <SelectTrigger className={cn("text-xs", className)}>
        <SelectValue>{selected?.label ?? "Model"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {choices.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <span className="flex flex-col items-start gap-0.5 py-0.5">
              <span>{m.label}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {m.provider} · {m.slug}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
