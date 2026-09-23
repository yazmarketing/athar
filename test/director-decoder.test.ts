import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { addAsset, runFfmpeg } from "../src/lib/director/media";
import { createProject } from "../src/lib/director/store";
import config from "../next.config";
it("imports an actual MP4 and produces its thumbnail with the native decoder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "athar-decode-"));
  const previous = process.env.ATHAR_DIRECTOR_ROOT;
  process.env.ATHAR_DIRECTOR_ROOT = dir;
  try {
    expect(config.serverExternalPackages).toContain("ffmpeg-static");
    const path = join(dir, "source.mp4");
    await runFfmpeg(["-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-t", "1", "-c:v", "libx264", "-threads", "2", "-pix_fmt", "yuv420p", path]);
    const project = await createProject("test-owner", {});
    const { asset } = await addAsset(project.id, "test-owner", new File([await readFile(path)], "DJI_test.MP4", { type: "video/mp4" }));
    expect(asset).toMatchObject({ kind: "video", width: 320, height: 180, duration: 1 });
    expect(asset.thumbnailUrl).toContain("thumbnail=1");
  } finally {
    if (previous === undefined) delete process.env.ATHAR_DIRECTOR_ROOT; else process.env.ATHAR_DIRECTOR_ROOT = previous;
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
