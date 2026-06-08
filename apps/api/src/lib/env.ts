const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "REDIS_URL",
  "SESSION_SECRET",
] as const;

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

export function validateEnv(env: NodeJS.ProcessEnv): void {
  const missing: RequiredEnvVar[] = REQUIRED_ENV_VARS.filter(
    (key) => !env[key],
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        "Copy .env.example to .env and set all required values before starting the API.",
    );
  }
}
