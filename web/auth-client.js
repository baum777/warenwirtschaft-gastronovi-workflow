export function createSupabaseAuthClient(config) {
  const baseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = config.supabasePublishableKey;

  async function authFetch(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        apikey: publishableKey,
        "content-type": "application/json",
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error_description || payload.msg || payload.message || `HTTP ${response.status}`);
    }

    return payload;
  }

  return {
    signInWithPassword({ email, password }) {
      return authFetch("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: JSON.stringify({
          email,
          password
        })
      });
    },
    signUp({ email, password, displayName }) {
      return authFetch("/auth/v1/signup", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          data: {
            display_name: displayName
          }
        })
      });
    }
  };
}
