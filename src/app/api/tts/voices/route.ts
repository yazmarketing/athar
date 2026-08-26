import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { listMunsitVoices, munsitApiConfigured } from "@/lib/munsit-tts";
import { listTtsVoices } from "@/lib/tts";
import { NOT_CONFIGURED_MESSAGE } from "@/lib/tts-segments";
import { proxiedAssetUrl } from "@/lib/tts-asset-proxy";
import type { MunsitVoice } from "@/lib/types";

/** Built-in voices change rarely — avoid hitting the provider on every keystroke. */
const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; voices: MunsitVoice[] } | null = null;

/** Sample/avatar URLs are rewritten to our own proxy — see tts-asset-proxy.ts. */
function withProxiedAssets(voice: MunsitVoice): MunsitVoice {
  return {
    ...voice,
    sample_url: proxiedAssetUrl(voice.sample_url),
    avatar_url: proxiedAssetUrl(voice.avatar_url ?? null),
  };
}

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!munsitApiConfigured()) {
      return NextResponse.json(
        { error: NOT_CONFIGURED_MESSAGE },
        { status: 503 }
      );
    }

    let library: MunsitVoice[];
    if (cache && Date.now() - cache.at < CACHE_MS) {
      library = cache.voices;
    } else {
      const raw = await listMunsitVoices();
      library = raw.map((v) => withProxiedAssets({ ...v, source: "library" as const }));
      cache = { at: Date.now(), voices: library };
    }

    const cloned = await listTtsVoices();
    const voices: MunsitVoice[] = [
      ...library,
      ...cloned.map((v) =>
        withProxiedAssets({
          id: v.id,
          voice_id: v.munsit_voice_id,
          name: v.name,
          description: v.description,
          gender: (v.gender as MunsitVoice["gender"]) ?? null,
          age: v.age,
          languages: v.languages,
          dialect: v.dialects,
          type: "cloned",
          sample_url: v.sample_url,
          avatar_url: v.avatar_url,
          source: "cloned" as const,
        })
      ),
    ];

    return NextResponse.json({ voices });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load voices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
