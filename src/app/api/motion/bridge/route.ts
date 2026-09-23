import { NextResponse } from "next/server";
import { motionAuth, motionError } from "@/lib/motion/http";
import { prepareBridge } from "@/lib/motion/bridge";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const auth = await motionAuth(req); if (auth.response) return auth.response;
  try {
    const { script } = await prepareBridge(auth.user.id);
    return new Response(script, { headers: { "Content-Type":"text/plain; charset=utf-8", "Content-Disposition":'attachment; filename="Athar-After-Effects.jsx"', "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff" } });
  } catch(e) {return motionError(e);}
}
export async function POST(req: Request) {
  const auth = await motionAuth(req); if (auth.response) return auth.response;
  try { await prepareBridge(auth.user.id); return NextResponse.json({ready:true}); } catch(e) { return motionError(e); }
}
