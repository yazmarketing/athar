# Athar: creative studio direction

Updated September 13, 2026 following the product owner's correction.

**Current control behavior is documented in [control-capability-audit.md](control-capability-audit.md). That audit supersedes the earlier editor, motion-tab and integration-promotion descriptions below.**

Athar's current product is a visual creation studio for YAZ Media. The primary path is discover a look → choose a video model → add references and direct the shot → generate → review and reuse from the library. Video is the lead tool, supported by images, storyboards, voice and reusable assets.

## Implemented in this revision

- Director is removed from the main application, navigation and landing page. Old `?view=director` links land on Explore. Existing project files and backend code are retained to avoid deleting work.
- Campaign is removed from primary navigation.
- Explore presents video creation first, a searchable catalog of 12 creative recipes, the existing configured video model choices and recent creations.
- Looks & motion has category filters for camera moves, product, visual effects and editorial treatments. The video workspace has a clean creation canvas, separate from the unchanged Explore catalog.
- Selecting a recipe populates the existing structured prompt, camera, look and cinematic controls. These are editable prompt recipes, not dedicated effect models. Selection never starts a paid generation.
- Starting a new creation clears old edit sources, reference media, audio and previous result selection so they cannot silently affect a new shot. Saved library records are unchanged.
- The original structured walkthrough starts automatically for new people and remains available on demand. Completion is checked for the signed-in person on the server, so a shared browser cannot suppress another teammate’s onboarding.
- Video has Create, Edit and Motion reference workflows. Editing accepts a direct MP4/MOV upload (100 MB maximum) through the existing storage upload path. Motion references use Seedance’s reference inputs; they do not claim dedicated motion tracking or Kling motion-control support.
- GPT-6 Astra is visible in the Image and Video prompt editor. The explicit choice requests that exact model with no provider substitution. Prompt development includes shot duration, camera/style context and cultural guidance; applying it preserves the other controls.
- The ChatGPT & After Effects dialog explains the current Athar capability and links to Higgsfield’s external plugin and desktop setup. It does not install or claim an Athar desktop bridge.
- The model shelf and video picker show each provider endpoint once. The existing standard and hero video tiers target the same Seedance 2.5 endpoint; saved hero jobs remain supported.

## Validation

Production build, TypeScript and focused lint pass. All 361 tests pass, including explicit Astra selection, missing model access without provider substitution, creator authorization, per-person onboarding, uploaded edit-source jobs and image-plus-motion reference jobs. Existing build tracing warnings remain in the transcript import and retained Director backend.

The signed-in local app was checked at desktop and phone widths: clean Video canvas, separate editing/motion inputs, missing-source guard, visible prompt text, prompt editor apply, integration dialog and original 20-step tour replay/advance/skip. No paid model generation or live storage upload was run; rendering quality and end-to-end provider access were not validated in this revision.

The optional component preview lives in `test/fixtures/studio` and uses sample data only. It does not expose authenticated routes, call providers or submit jobs.

## What the Higgsfield reference actually implies

Higgsfield offers a web studio plus access from external agents through MCP/CLI. Its After Effects workflow works with editable compositions in the desktop application. Adding a reasoning model to an internal storyboard planner is not equivalent to providing those tools or controlling After Effects.

An Athar desktop integration would need an authenticated tool API for model discovery, cost estimates, asset upload, job submission, job status and results; a separate installed desktop bridge for creative applications; application-specific operations for editable documents; and a host agent to plan and execute those operations. MCP is an interface to tools, not the renderer or the generation model itself.

The current revision does not ship an Athar MCP server, an After Effects bridge, a ChatGPT plugin, or additional video provider integrations. It does not claim Higgsfield feature parity. The next model integrations need verified provider access and capability-specific adapters; do not advertise unavailable model choices as working features.

## Next production milestones

1. Benchmark real YAZ briefs across the configured video models: reference fidelity, temporal consistency, camera adherence, cultural detail, audio and usable output rate. Use results to recommend models.
2. Build a library of approved example renders for each recipe, with prompts, references and settings that the team can reproduce. The current original motion illustrations communicate direction and are not sample model outputs.
3. Add specialized effects or editing models only where their APIs support the required controls. Prompt recipes alone do not guarantee motion transfer, object replacement or identity preservation.
4. Add the agent connector and desktop bridge as a separately validated workflow when desktop motion design becomes the priority.

Sources: https://higgsfield.ai/mcp and https://www.higgsfield.company/blog/ai-motion-designer-after-effects-gpt (reviewed September 13, 2026).
