# Image and video control audit

Reviewed 13 September 2026. This supersedes the workflow/control claims in `studio-direction.md`.

## Product contract

- Explore retains its current recipes. Video is a creation/edit workspace, not a duplicate preset gallery.
- Cinema Studio has its own navigation entry. Its film, camera, colour, lighting, emotion, tempo and pacing choices compile into creative prompt instructions. They are not physical camera simulation or separate rendering models.
- Image and Video use the dock directly. The separate Astra prompt editor and integration promotion are removed from these screens. Onboarding retains its original structure, with the editor step replaced by creative details.
- Dedicated motion control is not connected. A Seedance video reference may guide motion, subject or style; this is not deterministic choreography transfer. Do not advertise a working Motion Control tab until a dedicated provider adapter is integrated and verified.

## Rendering controls

| Operation | Inputs | Model-dependent controls | Provider operation |
| --- | --- | --- | --- |
| Create video | Text; optional images, video or audio references | Mini: 4–15s, 480/720p, 9 images/3 video/3 audio. 2.5: 4–30s, 480/720/1080p, 30 images/10 video/10 audio | Explicit `reference` task on 2.5 when reference media is supplied |
| First-frame video | One ordinary image with no video/audio | 2.5 inherits image ratio; Mini accepts explicit ratio | `first_frame` role, 2.5 adaptive ratio |
| Edit video | One source video; optional image/audio references | Athar's edit adapter uses 2.5; source ratio and approximate duration inherited | Explicit `edit`, adaptive ratio, duration -1 |
| Extend video (from Library) | One source video, continuation prompt | 2.5; source ratio; selected extension duration | Explicit `extend`, adaptive ratio, explicit duration |
| Cinema Studio | New shot with optional references | Same renderer capabilities, plus prompt-based creative direction | Same validated creation adapter |
| Image | Prompt and optional reference images | Reference ceiling and resolution follow the selected model; Seedream 5.x exposes 2K only; Pro exposes 4K | Selected image provider preserved, including draft reference edits |

Mini audio needs a visual reference. Audio references force sound output on. Otherwise Sound on/off controls the provider's `generate_audio` flag. Uploaded audio references are restricted to MP3/WAV. Ratios shown by Athar for video are 16:9, 9:16, 1:1 and 21:9; new unsupported ratios are rejected. Historical jobs keep their existing fallback behavior.

Changing models with excessive attachments is blocked with a removal instruction, not silently truncated. UI and API share video capability validation. Invalid workflow/source/resolution/duration combinations are rejected before job creation. Image requests also validate reference count and selected resolution; selecting a model no longer silently removes image references. Nano Banana's current adapter does not send explicit size/ratio, so those controls read Auto rather than implying precision it does not provide.

Client/project organise outputs; brand kit contributes server-side prompt guidance. Verified faces supply provider-registered asset references. These are meaningful shared controls, not renderer settings.

## Verification and limits

373 automated tests pass, including request rejection, explicit edit/extend/reference operations, source-controlled ratio, duration limits and model-specific attachment counts. TypeScript, focused lint and production build pass. Existing unrelated build tracing warnings remain in transcript import and retained Director code.

Signed-in browser checks verify the separate Cinema Studio entry, absence of the prompt editor, Mini's 15s ceiling and 480/720p-only choices, Mini audio visibility, Seedream 5's 2K-only option, and Nano Banana's automatic frame/size. The edit screen was checked at desktop and phone widths. Local development now reuses its Postgres pool across module reloads after a connection exhaustion error surfaced during preview.

No paid generation or live file upload was performed in this audit. Provider access, fidelity, motion adherence and real output quality still need a representative YAZ render benchmark. The provider validates the actual remote media's duration, codec, combined-reference duration and content; Athar does not yet preflight every remote asset's bytes. Existing HEVC/browser conversion is retained. Do not describe these automated checks as proof of output quality or Higgsfield feature parity.

## Sources

- BytePlus ModelArk, Create a video generation task: https://docs.byteplus.com/en/docs/ModelArk/1520757 (page update 9 September 2026; read 13 September).
- Higgsfield Motion Control: https://higgsfield.ai/create/motion-control
- Higgsfield Cinema Studio: https://higgsfield.ai/blog/cinema-studio-3.0

The BytePlus operation schema, not competitor marketing labels, determines what Athar sends. Subsequent provider additions need their own validated schema, inputs, limits, costs and result handling before appearing as working tools.
