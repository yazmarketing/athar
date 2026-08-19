import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { getBrandKit } from "@/lib/brand-kits";
import { arkChat } from "@/lib/byteplus-server";
import { openaiChat, openaiConfigured } from "@/lib/openai-server";
import {
  createStoryboard,
  insertEntities,
  insertPanels,
} from "@/lib/storyboards";
import {
  ANGLES,
  SHOT_SIZES,
  enforceScreenDirection,
  slugify,
  stripMotion,
} from "@/lib/storyboard-prompt";
import type { StoryboardRegister } from "@/lib/types";

export const maxDuration = 120;

const REGISTERS = new Set(["sketch", "line", "mono", "photoreal"]);
const DIRECTIONS = new Set(["left", "right", "neutral", "to-camera"]);
const KINDS = new Set(["character", "location", "prop"]);
const ASPECTS = new Set(["16:9", "9:16", "1:1", "4:5", "21:9"]);

type Body = {
  title?: string;
  script?: string;
  panelCount?: number;
  register?: string;
  aspect?: string;
  clientId?: string | null;
  projectId?: string | null;
  brandKitId?: string | null;
};

/**
 * Script or brief → a storyboard's world and its panels.
 *
 * Two things are being decided here, and the order matters. First the world:
 * who is in this, what they wear, where it happens. Only then the panels,
 * which reference that world by slug rather than describing it again — which
 * is what stops panel 23 drifting away from panel 4.
 */
const SYSTEM = [
  "You are a storyboard artist and first assistant director breaking a script",
  "or brief into a shooting board. The board must read as ONE continuous piece.",

  // 1. The world, decided once.
  "FIRST decide the world. List every recurring character, location and",
  "significant prop as an `entity`. Each gets: a slug (lowercase, hyphenated),",
  "a kind (character | location | prop), a name, a `description` precise enough",
  "that two different artists would draw the same thing (age, build, hair,",
  "face, distinguishing features for people; layout, materials and period for",
  "locations), and for characters a `wardrobe` describing exactly what they",
  "wear. Wardrobe and appearance NEVER change between panels unless the script",
  "explicitly says so.",

  // 2. The look, inherited by every panel.
  "Then decide a `look`: the lighting and the colour grade for the whole piece.",

  // 3. Panels, in film grammar.
  "THEN write the panels in story order. Each panel has:",
  `— shotSize, one of: ${Object.keys(SHOT_SIZES).join(", ")}.`,
  `— angle, one of: ${Object.keys(ANGLES).join(", ")}.`,
  "— lens, e.g. '35mm' or '85mm', or empty.",
  "— screenDirection: left | right | neutral | to-camera. Where the subject",
  "  faces. Keep it consistent across a scene: if someone exits frame right,",
  "  they enter the next panel from frame left. Two people in conversation",
  "  must face OPPOSITE directions.",
  "— entities: the slugs appearing in this panel. Always include the location.",
  "— action: what is happening in this single frozen frame. Present tense.",
  "— dialogue: the line spoken over this panel, or empty.",
  "— motion: any camera move or transition, or empty.",
  "— durationS: roughly how long this panel is on screen.",

  // 4. Stills and motion are different languages.
  "`action` describes ONE FROZEN FRAME. Never put camera movement or",
  "transitions in `action` — no 'the camera pushes in', no 'cuts to', no",
  "'pans across'. Those go in `motion`. An image model handed a camera move",
  "renders the sentence instead of the picture.",

  // 5. Vary the coverage, or it reads as a slideshow.
  "Vary the shot sizes deliberately: open a scene wide enough to establish the",
  "geography, then move in. Do not use the same shot size twice in a row",
  "unless the story needs it.",

  // 6. Cultural precision — same standard as the campaign planner.
  "CULTURAL ACCURACY IS MANDATORY. Never use a bare nationality or a vague",
  "garment name and hope the model knows it. Describe the actual garment, how",
  "it is worn, and the setting, precisely and respectfully.",
  "For Emirati/Gulf subjects specifically:",
  "— An Emirati woman wears a flowing black abaya (an open or closed robe worn",
  "  over her clothes, often with subtle embroidery or a tailored modern cut)",
  "  with a shayla: a long black rectangular scarf draped over the head and",
  "  swept over the shoulders. It is NOT a chador, NOT a tight wrapped hijab,",
  "  and NOT a shapeless enveloping cloak.",
  "— An Emirati man wears a crisp white kandura (ankle-length robe) with a",
  "  ghutra headscarf (white or red-and-white checked) held by a black agal.",
  "— Emirati architecture and interiors are contemporary and high-specification;",
  "  avoid generic orientalist or desert-cliché staging unless the brief asks.",
  "Apply the same specificity to any other culture, faith or region.",
].join(" ");

function jsonFrom(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
}

const str = (v: unknown, max = 600) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(req: NextRequest) {
  const auth = await requireCreator();
  if (auth.response) return auth.response;
  const sessionUser = auth.user!;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const script = body.script?.trim();
  if (!script) {
    return NextResponse.json(
      { error: "A script or brief is required" },
      { status: 400 }
    );
  }
  const panelCount = Math.min(Math.max(body.panelCount ?? 8, 2), 24);
  const register: StoryboardRegister = REGISTERS.has(body.register ?? "")
    ? (body.register as StoryboardRegister)
    : "sketch";
  const aspect = ASPECTS.has(body.aspect ?? "") ? body.aspect! : "16:9";

  let brandLook = "";
  if (body.brandKitId) {
    const kit = await getBrandKit(body.brandKitId).catch(() => null);
    if (kit) brandLook = kit.brand_tokens;
  }

  const instruction = [
    SYSTEM,
    brandLook ? `Honour this brand look throughout: ${brandLook}.` : "",
    `Write exactly ${panelCount} panels.`,
    'Return ONLY JSON: {"title":"…","look":{"lighting":"…","grade":"…"},',
    '"entities":[{"slug":"…","kind":"character","name":"…","description":"…",',
    '"wardrobe":"…"}],"panels":[{"shotSize":"MS","angle":"eye","lens":"35mm",',
    '"screenDirection":"left","entities":["slug"],"action":"…","dialogue":"…",',
    '"motion":"…","durationS":3}]}',
  ]
    .filter(Boolean)
    .join(" ");

  const chat = openaiConfigured() ? openaiChat : arkChat;
  let parsed: unknown;
  try {
    const raw = await chat({
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: script.slice(0, 12000) },
      ],
      temperature: 0.5,
      maxTokens: 4000,
    });
    parsed = jsonFrom(raw);
  } catch {
    return NextResponse.json(
      { error: "Could not read the breakdown — try again" },
      { status: 502 }
    );
  }

  const root = (parsed ?? {}) as Record<string, unknown>;

  // Entities first: panels are only meaningful against the world they name.
  const rawEntities = Array.isArray(root.entities) ? root.entities : [];
  const seen = new Set<string>();
  const entities = rawEntities
    .map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      const name = str(o.name, 80) || "Unnamed";
      const slug = slugify(str(o.slug, 60) || name);
      const kind = KINDS.has(str(o.kind, 20)) ? str(o.kind, 20) : "character";
      return {
        slug,
        kind,
        name,
        description: str(o.description, 900),
        wardrobe: str(o.wardrobe, 500),
      };
    })
    .filter((e) => {
      if (seen.has(e.slug)) return false;
      seen.add(e.slug);
      return true;
    })
    .slice(0, 24);

  if (entities.length === 0) {
    return NextResponse.json(
      { error: "The breakdown found no characters or locations — try a fuller brief" },
      { status: 422 }
    );
  }

  const rawPanels = Array.isArray(root.panels) ? root.panels : [];
  const planned = rawPanels.slice(0, panelCount).map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    // Camera language leaks into `action` even when the planner is told not
    // to; strip it and keep it as motion instead of rendering the sentence.
    const { still, motion } = stripMotion(str(o.action, 700));
    const declaredMotion = str(o.motion, 300);
    const slugs = (Array.isArray(o.entities) ? o.entities : [])
      .map((s) => slugify(String(s)))
      .filter((s) => seen.has(s));
    const shotSize = Object.keys(SHOT_SIZES).includes(str(o.shotSize, 10))
      ? str(o.shotSize, 10)
      : "MS";
    const duration = Number(o.durationS);
    return {
      number: i + 1,
      shotSize,
      angle: Object.keys(ANGLES).includes(str(o.angle, 12))
        ? str(o.angle, 12)
        : "eye",
      lens: str(o.lens, 40),
      screenDirection: DIRECTIONS.has(str(o.screenDirection, 12))
        ? str(o.screenDirection, 12)
        : "neutral",
      action: still,
      dialogue: str(o.dialogue, 600),
      motion: [declaredMotion, motion].filter(Boolean).join(" ").trim(),
      durationS: Number.isFinite(duration) && duration > 0 ? duration : null,
      entitySlugs: slugs,
    };
  });

  if (planned.length === 0) {
    return NextResponse.json(
      { error: "The breakdown produced no panels — try again" },
      { status: 422 }
    );
  }

  // The 180° rule, applied after planning rather than trusted to the model.
  const panels = enforceScreenDirection(planned);

  const lookRaw = (root.look ?? {}) as Record<string, unknown>;
  const look = {
    lighting: str(lookRaw.lighting, 400),
    grade: str(lookRaw.grade, 400),
  };

  try {
    const board = await createStoryboard({
      title: str(body.title, 200) || str(root.title, 200) || "Untitled board",
      sourceText: script,
      register,
      aspect,
      look,
      clientId: body.clientId ?? null,
      projectId: body.projectId ?? null,
      brandKitId: body.brandKitId ?? null,
      createdBy: sessionUser.id,
    });
    await insertEntities(board.id, entities);
    await insertPanels(board.id, panels);
    return NextResponse.json({ storyboard: board });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
