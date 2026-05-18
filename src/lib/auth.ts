import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const supabase = createSupabaseAdminClient();
        const { data, error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });

        if (error || !data.user) return null;

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name ?? data.user.email,
          image: data.user.user_metadata?.avatar_url ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.id = user.id;
      }

      // For Google sign-ins, resolve a Supabase auth UUID so every other
      // API route (which inserts with user_id FK) gets a real UUID.
      //
      // IMPORTANT: do NOT guard with !token.id here. When NextAuth processes a
      // Google sign-in it first sets token.id = user.id, which is Google's
      // numeric `sub` string — not a Supabase UUID. The !token.id guard would
      // then short-circuit and the vehicles INSERT would fail the FK constraint.
      //
      // `account` is only present on the initial sign-in callback, so this
      // block naturally runs at most once per session.
      if (account?.provider === "google" && profile?.email) {
        const supabase = createSupabaseAdminClient();

        let match: { id: string } | undefined;
        let page = 1;
        while (!match && page <= 10) {
          const { data } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
          match = data?.users.find((u) => u.email === profile.email);
          if (!data || data.users.length < 100) break;
          page++;
        }

        if (match) {
          token.id = match.id;
        } else {
          const { data: created } = await supabase.auth.admin.createUser({
            email: profile.email,
            email_confirm: true,
            user_metadata: {
              full_name: profile.name,
              avatar_url: profile.picture,
            },
          });
          if (created.user) token.id = created.user.id;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
