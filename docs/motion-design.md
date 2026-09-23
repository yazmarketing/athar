# Athar Motion Design

Motion Design is a separate local workspace in the Athar sidebar. It uses the configured OpenAI API connection with the exact `gpt-6-astra` model to design an editable scene, and a native After Effects script to execute it. It does not switch models, simulate a native preview, install Higgsfield, or claim to be a ChatGPT plugin.

## Connection and workflow

1. Run Athar locally and sign in with a creator account. Production-mode local installs require `ATHAR_MOTION_LOCAL=1`; the remote deployment is intentionally unavailable for desktop file access.
2. Open After Effects. In Settings → Scripting & Expressions, enable **Allow Scripts to Write Files and Access Network**. Adobe applies this setting to all scripts. The Athar bridge itself communicates through local files only.
3. Choose **Prepare bridge** in Motion Design, then run `scripts/motion/bridge.jsx` from the local Athar folder. Alternatively, download the account-specific `Athar-After-Effects.jsx` from Motion Design. Choose File → Scripts → Run Script File in After Effects and open the downloaded JSX. It connects automatically. Leave its palette open; closing it disconnects.
4. Create motion from a brief with optional footage, images and audio, or read the active After Effects composition to direct an edit.
5. Review Astra’s proposed layers and timing. **Build in After Effects** produces the native composition, an editable `.aep`, and an actual PNG frame preview.
6. Direct a revision in Athar or adjust layers directly in After Effects. **Render video** renders the built native composition using After Effects’ Lossless output template. Athar also encodes a playable H.264/AAC MP4, retaining the native MOV master.

Rebuilding recreates the current design; manual modifications made after a build are included when rendering but are not automatically written into Astra’s scene description. To direct edits to manual changes, create an edit project and read that active composition. Existing compositions are duplicated before changes. AEP files and linked assets stay in this workspace; an AEP download is not a portable collected-footage package.

While work is running, the preview area shows an animated Athar activity panel, elapsed time, and real workflow status. Queued requests, active design, expanded recovery, native building/rendering and web encoding have distinct messages. The animation is an indeterminate activity illustration, not a generated preview or completion estimate; reduced-motion preferences stop its movement.

## Supported execution

- New text, rectangular and elliptical shape layers; uploaded footage, still images and audio.
- Position, scale, rotation and opacity keyframes with linear, smooth or hold interpolation.
- Native Gaussian blur, glow and drop shadow; normal, add, screen and multiply compositing.
- Existing-layer copy changes, visibility, transforms and these effects. Animated source-text changes and transforms driven by expressions or separated position dimensions produce actionable errors instead of silently replacing their behavior.
- Revision history with restore; persisted operation status; genuine native frame and movie outputs.
- Create settings: landscape, portrait, square and 4K canvases, 24/25/30/50/60 fps, up to 600 seconds. Existing compositions keep their original settings, including fractional frame rates.
- Upload PNG/JPEG/WebP (converted for native compatibility), MP4/MOV, WAV/MP3; 80 MB per asset, 80 assets. Native media duration is checked before placing a trimmed section.

Tracking, rotoscoping, masks, arbitrary effects/plugins, 3D scenes, generative asset creation, and automatic frame-by-frame visual quality correction are **not** automated by this adapter. They remain available for manual work in After Effects. This is an editable motion workflow, not feature parity with all of Higgsfield’s motion tools.

Astra receives asset metadata and up to eight opening-frame/image references, source-composition metadata, installed font names, the previous design and the new direction. An opening frame is not full-video analysis. Arabic copy is preserved in the contract, but the chosen installed font and actual native result still need visual review.

## Storage and reliability

Account-scoped files are under `.athar/motion/<hashed-user-id>/projects/<id>`. Creator authorization, local-host restriction and same-origin validation apply to all routes. Assets arrive through authenticated raw upload requests, decoded before being registered, and referenced by generated IDs. Output downloads support byte ranges. Source credentials are never included in the bridge.

Astra returns validated declarative JSON. A fixed native adapter executes supported operations; no model-authored JavaScript or expressions are evaluated. Commands use atomic file writes and a claim step. Unclaimed commands expire after two minutes. Native errors are returned to Athar. Designs use OpenAI background Responses with the exact Astra model and high reasoning. Athar saves the direction, output settings and provider response ID before completion. Each design starts with a 64,000-token response allowance (reasoning plus visible output). A confirmed `max_output_tokens` result gets one fresh attempt at 128,000 tokens with the full original brief and assets; partial JSON is never built. A second exhaustion stops with a saved-direction retry option. Ambiguous network failures do not trigger this retry. Short, leased workers submit once and retrieve that same response on subsequent workspace polls; reopening the workspace resumes checks after a local restart. Transient retrieval timeouts retry without a second generation. Unconfirmed submissions stop with an actionable error rather than automatically sending paid work twice. The previous scene and outputs remain until a new scene passes validation. Background responses use `store: true` so they remain retrievable after leaving the workspace (OpenAI response retention applies). Legacy in-flight requests without a saved job still expire after five minutes. Interrupted web encoding leaves the native master available. Long native runs time out in the UI after 90 minutes; check After Effects before retrying.

## Validation status

- Live GPT-6 Astra request succeeded and produced a six-layer, three-second Athar brand sting with transform/opacity keyframes.
- Live background revision verified: a separate copy of the six-layer design completed with the requested 2.3–3 second opacity fade and a new saved revision.
- Automated recovery tests cover slow responses beyond the former four-minute cutoff, retrieval timeouts, stale worker replies, ambiguous submissions, and reopening persisted jobs.
- Automated tests cover scene validation, exact Arabic text, unsupported operations, missing assets, changed source layers, the ExtendScript JSON boundary, real media decoding, invalid media and playable H.264 conversion.
- All 414 tests pass; TypeScript and production compilation passed.
- **Native create/build/render verified in After Effects 26.5.** The saved three-second Astra design produced a real editable AEP, a native PNG frame, a Lossless MOV, and a playable MP4. The launcher now loads the authenticated, prepared account-specific script; the source template is not a runnable `.jsx`. Native build and render dispatch use explicit branches.

## Reference research

Higgsfield describes native After Effects layers, keyframes and editable compositions controlled from its ChatGPT integration: https://higgsfield.ai/blog/ai-motion-designer-after-effects-gpt and https://higgsfield.ai/plugins/after-effects. Athar implements its own local bridge rather than invoking that service.

Adobe’s scripting instructions: https://helpx.adobe.com/uk/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html

Background request reference: https://developers.openai.com/api/docs/guides/background

## Advanced native motion (bridge revisions 2–3)

The design contract now supports real 3D planes, animated camera position/target/zoom/focus/aperture, depth of field, motion blur, and custom incoming/outgoing keyframe influence. Shape layers support editable Bezier paths, strokes and animated Trim Paths. Related 2D or 3D stages can be grouped into editable precompositions; 3D groups retain the main camera through collapsed transforms. Layers support additive/subtractive masks with animated expansion/opacity, same-dimension parent controllers, and compact repeat recipes expanded into individually editable layers (400 total maximum). Blur, glow and shadow amounts can be animated. The original schema and saved revisions still load.

Re-prepare and run the bridge after this update. The heartbeat advertises revision 3. Cameras, paths, masks and repeats require revision 2; grouped subcompositions require revision 3. The server rejects unsupported advanced scenes on an old bridge instead of silently ignoring controls. Models produce bounded data only; no model-written scripts or arbitrary expressions execute.

Designs may include chronological story beats, saved as native composition markers. Optional sound cues (tone, rise, impact, air) are synthesized deterministically into a stereo 48 kHz WAV, mixed below clipping and imported into the native composition. Cue times follow the composition, with fades and pan. This is procedural sound design, not licensed music or recorded foley. Scores are limited to 120 seconds; longer films can use uploaded audio. The native output module explicitly enables audio.

Every build saves actual frames at 10%, 30%, 50%, 70% and 90% of the composition. The final rendered film is sampled again after encoding, replacing build stills. **Review with Astra** sends these native frames, the brief, the scene and uploaded reference images through the same durable background workflow. It returns specific strengths and fixes without overwriting the animation. **Use these notes as my direction** fills the revision field; the creator can edit it before submitting. Reviews explicitly cover sampled frames and infer timing from keyframes: they do not certify motion smoothness, audio quality or delivery readiness. Play and inspect the film before delivery. A new build/render/direction invalidates the previous review.

**Open the Athar studio study** creates a separate seven-second editable composition with the original brand PNGs copied into its own project. It demonstrates a macro opening, real camera travel through depth traces, masked logo echoes, a resolved mark/wordmark hold, and timed sound cues. It is an authored starting study, not an Astra-generated or automatically approved final. Existing projects and revisions remain intact.

Limits: no native mesh extrusion, tracked object replacement, imported 3D models, arbitrary AE plug-ins, unrestricted expressions, lighting rigs, or automatic human-quality sign-off. Source edits still preserve the active composition and reject expression-driven/separated channels that the adapter cannot safely modify. An AEP references local assets; downloading the AEP alone is not a portable collected package.

Validation on 14 September 2026: the revised seven-second Astra scene built in After Effects 26.5 and rendered to a 1920×1080, 30 fps H.264 preview with a stereo 48 kHz soundtrack. The native master contains 210 frames with an exactly still final 39-frame hold. Frame critique and revision were exercised with the actual Astra connection. Native subcomposition grouping still requires a bridge reload and a separate final native check; code validation alone is not that check.

## Original composition studies

Bridge capability 4 adds a read-only `inspect` command. `Study source style`
resolves the pinned original composition by ID, even when a generated revision
is active in After Effects. `Use active composition instead` explicitly selects
a different source. Source layers and project files are not changed while capturing a study.
Temporary one-frame render jobs are removed afterwards and existing queue
flags are restored, including on failure.

A study stores 12 timestamped native stills across the source work area, with
extra sampling near the entrance, and a bounded property report: native colour
values, text/font/tracking, effects, masks, vector geometry, transform keys,
temporal speed/influence, evaluated expression samples and nested compositions.
Disabled effects and irrelevant default property groups are excluded. Bounds:
100 layers per composition, 12 compositions, nesting depth 4, 2200 properties,
24 keys per property. The report states when truncated. Unreadable properties
are labelled; expression source code and local footage paths are not exported.

Reference PNGs remain local and account-scoped. Astra receives resized JPEG
copies, source metadata and original timestamps, separately labelled from prior
generated output. Colour-space metadata accompanies native values. New edit
requests require a source study; legacy metadata-only reads cannot silently
produce a generic match. Refresh after changing the original in After Effects.
Astra must return a reviewable `styleMatch` explanation of palette, typography,
motion, layout and limitations. This explanation is not proof of visual parity.

Studies persist across revisions. Failed captures preserve the previous design
and outputs. The regular After Effects render pipeline creates lossless one-frame movies,
which the server decodes to PNG. This replaces saveFrameToPng, which produced
false red/black colours on the tested 32-bpc purple/white source. Generated
build previews use the same corrected path. All twelve source frames must exist
before a capture is marked ready. Source stills are not a full
film: motion between samples, audio, external footage internals and unsupported
third-party effects still require review. The engine adapts supported native
primitives; it does not automatically clone arbitrary plugins or expressions.

The available-font list now includes up to 2000 installed PostScript names,
rather than truncating to the first 150 alphabetically and falsely excluding
brand fonts such as DMI.

Native preview renders run after the build undo group closes. A preview-only failure preserves the built editable composition. Decoded intermediate movies are removed, and native operations check available disk space before queueing.

Text masks support space: text-box, mapping a declared design box to the actual font anchor. This prevents centre-out reveals clipping point text. The gala revision has this correction; final native verification awaits reconnecting After Effects after the host disk-full incident.

## Reference-led authoring (September 14)

A composition can now be used in two distinct ways:

- **Edit composition** duplicates the original composition and retains its output settings.
- **Create motion → Composition reference** studies the active After Effects composition while keeping a new deliverable's dimensions, frame rate and duration independent. Selecting a different reference preserves the previous project.

New reference-based requests use two persisted Astra stages: reference treatment (visual language, animation language, adaptation plan, native reuse and limitations), then native scene construction. Both stages recover confirmed response IDs without duplicate submissions. The treatment is visible in the workspace and does not constitute rendered-output approval.

Bridge capability 6 studies up to 64 nested compositions, eight nesting levels and 24,000 property nodes; up to 128 keys per property include temporal ease and spatial tangents. Twelve native frames cover the selected work area and the full timeline. Existing expression text is reference data only. Unreadable properties and truncation are reported. Plugin internals, externally linked footage contents, expression libraries and every intermediate frame cannot be exhaustively inferred from this capture.

`nativeModules` selects captured composition IDs and copies their complete native layer stacks into independent precomposition wrappers. The native duplicate retains effects, masks, keyframes, parenting, mattes and local expression links. Top-level source copy/layout changes are validated against the captured layer inventory. Source Text with keyframes or expressions is rejected rather than overwritten. Nested compositions and media remain linked to their original sources; the adapter does not edit them or rewrite named external expression links. Installed plugins and media dependencies remain required. This is native reuse, not an arbitrary effect-authoring engine.

Build previews target authored entrance/hold/exit timing where available and persist their actual timestamps. A still review does not verify smoothness, audio, or delivery readiness. Full playback and human creative approval remain necessary. Rendering reserves at least 5 GiB, with a larger calculated reserve for lossless exports, to avoid the previous near-full-disk preview failure.

Text and shape design-box masks have explicit coordinate modes (`text-box` and `layer-box`), mapped to native anchors before construction. Transparent native masters select an existing alpha output template; Channels is read-only through the native scripting settings interface.
