const isTrackedEnv = ["development", "staging", "production"].includes(
  import.meta.env.MODE,
);

const getBaseUrl = (): string | null => {
  return import.meta.env.VITE_API_BASE_URL || null;
};

async function apiPost(
  endpoint: string,
  body?: unknown,
  force = false,
): Promise<unknown> {
  if (!force && !isTrackedEnv) return;
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    if (force) {
      throw new Error("API base URL is not configured.");
    }
    return;
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Server returned status ${response.status}`);
  }

  return response.json().catch(() => ({}));
}

export const api = {
  recordPageVisit(path: string) {
    return apiPost("/page-visits", { path }).catch(() => {});
  },
  recordPwaInstall(platform: string) {
    return apiPost("/pwa-installs", { platform });
  },
  recordInstallVisit() {
    return apiPost("/install-visits").catch(() => {});
  },
  recordCoffeeVisit() {
    return apiPost("/coffee-visits").catch(() => {});
  },
  sendFeedback(type: string, email: string | null, message: string) {
    return apiPost("/feedback", { type, email, message }, true);
  },
};
