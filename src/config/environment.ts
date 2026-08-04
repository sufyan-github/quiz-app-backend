export function validateProductionEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const required = ['DATABASE_URL', 'JWT_SECRET', 'OPENAI_API_KEY', 'INTERNAL_API_KEY', 'PHP_GATEWAY_URL', 'CORS_ALLOWED_ORIGINS'];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) throw new Error(`Missing required production configuration: ${missing.join(', ')}`);

  const origins = process.env.CORS_ALLOWED_ORIGINS!.split(',').map((value) => value.trim()).filter(Boolean);
  if (origins.includes('*') || origins.some((origin) => !origin.startsWith('https://'))) {
    throw new Error('CORS_ALLOWED_ORIGINS must contain explicit HTTPS origins in production');
  }
  if (!process.env.PHP_GATEWAY_URL!.startsWith('https://')) {
    throw new Error('PHP_GATEWAY_URL must use HTTPS in production');
  }
  if (process.env.INTERNAL_API_KEY!.length < 32) {
    throw new Error('INTERNAL_API_KEY must contain at least 32 characters');
  }
}
