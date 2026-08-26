export async function register() {
  // Node-only APIs (process.on) must stay out of this file: it is also
  // bundled for the Edge runtime, and the build fails on static analysis.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
