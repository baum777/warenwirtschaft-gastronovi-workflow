import { ActorAuthError } from "./actor.js";

export type AuthenticatedAuthUser = {
  id: string;
  email: string;
  userMetadata: Record<string, unknown>;
};

export type SupabaseAuthServicePort = {
  verifyAccessToken(token: string): Promise<AuthenticatedAuthUser>;
};

type FetchLike = typeof fetch;

export class SupabaseAuthService implements SupabaseAuthServicePort {
  public constructor(
    private readonly options: {
      supabaseUrl: string;
      publishableKey: string;
      fetchImpl?: FetchLike;
    }
  ) {}

  public async verifyAccessToken(token: string): Promise<AuthenticatedAuthUser> {
    const response = await (this.options.fetchImpl ?? fetch)(
      `${this.options.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          apikey: this.options.publishableKey,
          authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new ActorAuthError("supabase session is invalid", 401);
    }

    const body = (await response.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : undefined;
    const email = typeof body.email === "string" ? body.email : undefined;

    if (!id || !email) {
      throw new ActorAuthError("supabase session did not include a user", 401);
    }

    const rawMetadata = body.user_metadata;

    return {
      id,
      email,
      userMetadata:
        rawMetadata && typeof rawMetadata === "object" && !Array.isArray(rawMetadata)
          ? (rawMetadata as Record<string, unknown>)
          : {}
    };
  }
}
