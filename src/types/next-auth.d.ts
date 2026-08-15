import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role?: string;
    team?: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: string;
      team?: string | null;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: string;
    team?: string | null;
  }
}
