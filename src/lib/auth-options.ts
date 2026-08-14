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

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    ...(googleEnabled
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
          const row = await upsertUser(email, user.name);
          user.id = row.id;
          user.role = row.role;
        } catch {
          return false;
        }
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as { role?: string }).role ?? "creator";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = (token.role as string) ?? "creator";
      }
      return session;
    },
  },
};
