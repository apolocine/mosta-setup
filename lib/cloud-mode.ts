// @mostajs/setup — Cloud mode detection and configuration
// Author: Dr Hamid MADANI drmdh@msn.com

export interface CloudModeConfig {
  /** Whether this is a cloud deployment */
  isCloud: boolean
  /** Portal database dialect (usually postgres) */
  portalDialect?: string
  /** Portal database URI */
  portalUri?: string
  /** Skip .env.local generation (config stored in DB for cloud) */
  skipEnvFile?: boolean
  /** Stripe keys to seed in settings */
  stripeSecretKey?: string
  stripePublicKey?: string
  /** Encryption key for URIs */
  encryptionKey?: string
  /** Default plan slug */
  defaultPlan?: string
}

/**
 * Detect if we're in cloud mode based on environment.
 */
export function detectCloudMode(): boolean {
  return process.env.MOSTA_CLOUD === 'true' || process.env.MOSTA_CLOUD === '1'
}

/**
 * Get cloud configuration from environment.
 */
export function getCloudConfig(): CloudModeConfig {
  const isCloud = detectCloudMode()
  if (!isCloud) return { isCloud: false }

  return {
    isCloud: true,
    portalDialect: process.env.MOSTA_PORTAL_DIALECT ?? 'postgres',
    portalUri: process.env.MOSTA_PORTAL_URI ?? '',
    skipEnvFile: true,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    stripePublicKey: process.env.STRIPE_PUBLIC_KEY ?? '',
    encryptionKey: process.env.ENCRYPTION_KEY ?? '',
    defaultPlan: process.env.MOSTA_DEFAULT_PLAN ?? 'free',
  }
}

/**
 * Validate cloud config before setup.
 */
export function validateCloudConfig(config: CloudModeConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!config.portalUri) errors.push('Portal database URI is required (MOSTA_PORTAL_URI)')
  if (!config.encryptionKey) errors.push('Encryption key is required (ENCRYPTION_KEY)')
  if (config.encryptionKey && config.encryptionKey.length !== 64) {
    errors.push('Encryption key must be 64 hex characters (32 bytes)')
  }

  return { valid: errors.length === 0, errors }
}
