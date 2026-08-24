import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { timingSafeEqual } from "crypto";
import {
  getUserAuthByEmail,
  isEmailAllowed,
  upsertUser,
} from "@/lib/auth-users";
import { verifyPassword } from "@/lib/passwords";

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const googleEnabled =
  Boolean(process.env.GOOGLE_CLIENT_ID?.trim()) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim());

/**
 * Read the signed-in member's Department (→ team) from the Google People API.
 * Best-effort: returns null if the People API isn't enabled, the scope wasn't
 * granted, or the profile has no department. Never throws.
 */
async function fetchGoogleDepartment(
  accessToken: string | undefined
): Promise<string | null> {
  if (!accessToken) {
    console.warn("[team-sync] no Google access token on the account");
    return null;
  }
  try {
    // People API only accepts PROFILE / CONTACT / DOMAIN_CONTACT /
    // OTHER_CONTACT. DOMAIN_PROFILE is not a valid source and 400s the
    // whole request — department lookup is best-effort, so stay on PROFILE.
    const res = await fetch(
      "https://people.googleapis.com/v1/people/me?personFields=organizations&sources=READ_SOURCE_TYPE_PROFILE",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    // Previously this failed silently, so a disabled People API or a missing
    // scope looked identical to "no department set". Log the real reason.
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `[team-sync] People API ${res.status} ${res.statusText}. ` +
          `Check the People API is enabled in the Google Cloud project and ` +
          `that the user.organization.read scope was granted. ` +
          detail.slice(0, 400)
      );
      return null;
    }

    const json = (await res.json()) as {
      organizations?: { department?: string; name?: string; title?: string }[];
    };
    const orgs = json.organizations ?? [];
    if (orgs.length === 0) {
      console.warn(
        "[team-sync] People API returned no organizations — the Workspace " +
          "profile likely has no Department set for this user."
      );
      return null;
    }

    // Prefer an entry that actually carries a department.
    const withDept = orgs.find((o) => o.department?.trim());
    const team =
      withDept?.department?.trim() ||
      orgs[0]?.department?.trim() ||
      orgs[0]?.name?.trim() ||
      null;
    if (!team) {
      console.warn(
        `[team-sync] organizations present but no department/name: ${JSON.stringify(
          orgs
        ).slice(0, 300)}`
      );
    }
    return team;
  } catch (err) {
    console.error("[team-sync] People API request failed", err);
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    ...(googleEnabled
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
              params: {
                // Department → team. `user.organization.read` is the scope
                // that actually authorises `organizations` on people/me;
                // `directory.readonly` only covers reading OTHER directory
                // profiles, which is why the department never came through.
                // Both are requested so either source can satisfy the read.
                // Do not set prompt=consent or access_type=offline: we only
                // need the one-shot access token, and forcing a new grant
                // makes Google return invalid_grant when the callback is
                // retried after a restart.
                scope: [
                  "openid",
                  "email",
                  "profile",
                  "https://www.googleapis.com/auth/user.organization.read",
                  "https://www.googleapis.com/auth/directory.readonly",
                ].join(" "),
              },
            },
          }),
        ]
      : []),
    CredentialsProvider({
      id: "credentials",
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";
        if (!email || !password) return null;

        if (!isEmailAllowed(email)) return null;

        // Accounts with a personal password must use it; others fall back
        // to the shared internal password.
        const record = await getUserAuthByEmail(email).catch(() => null);
        if (record && !record.active) return null;
        let ok: boolean;
        if (record?.password_hash) {
          ok = await verifyPassword(password, record.password_hash);
        } else {
          const expected = process.env.AUTH_INTERNAL_PASSWORD ?? "";
          ok = Boolean(expected) && safeEqual(password, expected);
        }
        if (!ok) return null;

        try {
          const user = await upsertUser(email);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;
      if (!isEmailAllowed(email)) return false;

      if (account?.provider === "google") {
        try {
          // Pull the member's Department from Google Workspace → their team.
          const team = await fetchGoogleDepartment(account.access_token);
          const row = await upsertUser(email, user.name, team);
          user.id = row.id;
          user.role = row.role;
          (user as { team?: string | null }).team = row.team ?? team ?? null;
        } catch (err) {
          console.error("Google sign-in failed while saving the user", err);
          return false;
        }
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as { role?: string }).role ?? "creator";
        token.team = (user as { team?: string | null }).team ?? null;
        if (user.image) token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = (token.role as string) ?? "creator";
        session.user.team = (token.team as string | null) ?? null;
        if (token.picture) session.user.image = token.picture as string;
      }
      return session;
    },
  },
};
