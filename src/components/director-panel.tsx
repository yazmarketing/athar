"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMOTION_PRESETS,
  ERA_PRESETS,
  GENRE_PRESETS,
  GRADE_PRESETS,
  LIGHT_LOOK_PRESETS,
  SHOT_PRESETS,
  TEMPO_PRESETS,
  type DirectorPreset,
} from "@/config/director";

export type DirectorPanelValue = {
  genreId: string;
  shotId: string;
  lightLookId: string;
  gradeId: string;
  emotionId: string;
  eraId: string;
  tempoId: string;
};

type Props = {
  value: DirectorPanelValue;
  onChange: (next: Partial<DirectorPanelValue>) => void;
};

function Picker({
  label,
  value,
  presets,
  onChange,
}: {
  label: string;
  value: string;
  presets: DirectorPreset[];
  onChange: (id: string) => void;
}) {
  const current = presets.find((p) => p.id === value) ?? presets[0]!;
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="px-0.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          size="sm"
          title={current.description}
          className="h-8 w-full min-w-0 rounded-lg border-white/10 bg-black/25 px-2.5 text-xs"
        >
          <SelectValue>{current.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex flex-col items-start gap-0.5 py-0.5">
                <span>{p.label}</span>
                <span className="text-[10px] text-muted-foreground">
                  {p.description}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function DirectorPanel({ value, onChange }: Props) {
  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
      <p className="mb-2 px-0.5 text-[11px] text-muted-foreground">
        Direct the shot for Seedance — genre, framing, light, grade. Raw leaves
        that line to your prompt.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Picker
          label="Genre"
          value={value.genreId}
          presets={GENRE_PRESETS}
          onChange={(genreId) => onChange({ genreId })}
        />
        <Picker
          label="Shot"
          value={value.shotId}
          presets={SHOT_PRESETS}
          onChange={(shotId) => onChange({ shotId })}
        />
        <Picker
          label="Light"
          value={value.lightLookId}
          presets={LIGHT_LOOK_PRESETS}
          onChange={(lightLookId) => onChange({ lightLookId })}
        />
        <Picker
          label="Grade"
          value={value.gradeId}
          presets={GRADE_PRESETS}
          onChange={(gradeId) => onChange({ gradeId })}
        />
        <Picker
          label="Emotion"
          value={value.emotionId}
          presets={EMOTION_PRESETS}
          onChange={(emotionId) => onChange({ emotionId })}
        />
        <Picker
          label="Era"
          value={value.eraId}
          presets={ERA_PRESETS}
          onChange={(eraId) => onChange({ eraId })}
        />
        <Picker
          label="Tempo"
          value={value.tempoId}
          presets={TEMPO_PRESETS}
          onChange={(tempoId) => onChange({ tempoId })}
        />
      </div>
    </div>
  );
}
