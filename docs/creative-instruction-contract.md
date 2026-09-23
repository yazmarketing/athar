# Creative instruction review — September 23, 2026

## Implemented

- Assistant edits describe the requested change separately from preservation instructions. They preserve identity unless a different identity is explicitly requested, do not replay old action/lighting commands, and retain brand exclusions.
- Seedream, Gemini and GPT Image receive avoidance rules as text through a shared compiler. The job keeps positive and negative instructions separately; the image record also preserves the compiled provider prompt (Seedream already records its payload).
- A missing client on a video request is resolved from its saved project. Explicit client/project mismatches still fail, as do projects without a client. This restores the Storyboard animation handoff.
- References do not upgrade Seedream draft to another model. Unknown image models, excess references and unsupported image resolutions fail before creating a job. Video reference limits are checked before queuing and again at execution. Gemini stops when a reference cannot be loaded and no longer retries by dropping requested output settings.
- Resize enlarges existing pixels without a generative model, retains alpha, and records exact dimensions with zero model cost. It cannot recover missing detail. The existing AI enhancement options are labelled Creative redraw and Conservative redraw, targeting 2K/4K rather than claiming 2×/4×. Smart finishing uses non-generative resize. The former background-removal action is labelled White backdrop and explicitly does not produce transparency.

## Next instruction improvements using the connected models

These are proposals, not shipped features or verified gains in output quality.

1. **Store an approved project brief.** Audience, communication goal, deliverables, exact copy, brand requirements, visual references and prohibited changes should be structured fields, not repeatedly copied free text. Snapshot the approved version on every job.
2. **Give each reference a purpose.** Extend existing character/product/style assets with per-request roles: baseline, identity, product geometry, composition, lighting or palette. Compile numbered instructions matching attachment order. A style reference must not silently replace a person's face; a product reference should govern packaging geometry, not the background.
3. **Separate instructions by task.** Creation needs subject, action, composition and treatment. Editing needs a baseline, a requested change and preservation rules. Image-to-video needs movement and timing without redescribing an approved subject. Storyboard needs continuity across shots. Do not append every available preset to every request.
4. **Detect contradictions before rendering.** Use deterministic checks for incompatible settings and optional reasoning-model review for contradictory creative directions. Show a proposed correction; preserve the user's wording until accepted. Do not silently paraphrase exact Arabic copy or brand language.
5. **Carry edit state forward.** Save edit branches, reference roles and approved baseline. For Gemini conversational editing, retain the complete provider response and required thought signatures; for OpenAI, evaluate its supported conversation/state mechanism for the selected model. Do not treat a locally displayed chat transcript as provider memory.
6. **Review against the actual references.** Give the reviewer the brief, baseline, references and candidate. Separate brief adherence, product/identity fidelity, exact copy, composition and defects. Keep AI critique advisory and record the human-selected winner.
7. **Measure the improvement.** Compare old/new instructions on a fixed YAZ brief set, including Arabic typography, UAE cultural details, products and multi-shot identity. Track approved-result rate, revisions, cost per approved asset and latency. Automated request tests prove correct wiring, not subjective fidelity.

## Tools still needed for stronger guarantees

- Mask-guided editing requires an editor for region selection, storage of the mask, and a capability-checked provider adapter. A mask guides generative editing; it does not guarantee unchanged pixels outside the region. Composite untouched source pixels back where strict preservation is needed.
- Transparent background extraction needs a tested segmentation/matting implementation with edge review. White-backdrop generation is not a substitute.
- Exact logos and Arabic copy should also have an editable compositing path with approved source artwork/fonts. Generating lettering alone is not a reliable delivery check.
- Temporal video quality requires playback and motion/audio review; still-frame critique cannot certify it.

Relevant provider documentation: [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation), [OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation). Verify model-specific support and account access before building a new operation.
