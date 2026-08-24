/**
 * Last-chance logging so a stray rejection cannot take the whole process
 * down. DigitalOcean reports that as exit 128 and a 503, with nothing in
 * the app logs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  process.on("unhandledRejection", (reason) => {
    console.error("unhandledRejection", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("uncaughtException", err);
  });
}
