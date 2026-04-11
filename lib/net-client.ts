// @mostajs/setup — NET client
// Communicates with a @mostajs/net server via REST for setup operations
// Author: Dr Hamid MADANI drmdh@msn.com

export interface NetClientConfig {
  url: string;           // http://host:4488
  apiKey?: string;       // msk_live_...
}

export interface NetHealthResponse {
  status: string;
  transports: string[];
  entities: string[];
}

/**
 * Client for communicating with @mostajs/net server during setup.
 * Used by runNetInstall to seed RBAC, create admin, run seeds via REST.
 */
export class NetClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private collectionMap: Record<string, string> = {};  // seedName → REST collection

  constructor(config: NetClientConfig) {
    this.baseUrl = config.url.replace(/\/$/, '');
    this.headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      this.headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
  }

  /** Load schema config and build collection name mapping */
  async loadCollectionMap(): Promise<void> {
    try {
      const config = await this.getSchemasConfig();
      for (const s of config.schemas || []) {
        // Map: entity name lowercase → actual collection
        // e.g. "Experience" → "experiences", "PermissionCategory" → "permission_categories"
        this.collectionMap[s.name.toLowerCase()] = s.collection;
        // Also map collection without trailing 's' → actual collection
        // e.g. "experience" → "experiences", "passenger" → "passengers"
        const singular = s.collection.replace(/s$/, '').replace(/ies$/, 'y');
        this.collectionMap[singular] = s.collection;
        this.collectionMap[s.collection] = s.collection;
      }
    } catch {}
  }

  /** Resolve a seed collection name to the actual REST collection */
  private resolveCollection(name: string): string {
    return this.collectionMap[name] || this.collectionMap[name.toLowerCase()] || name;
  }

  // ── Health & Status ──────────────────────────────

  /** Test connectivity to the NET server */
  async health(): Promise<NetHealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`NET server returned ${res.status}`);
    return res.json() as Promise<NetHealthResponse>;
  }

  /** Test database connection via NET */
  async testDbConnection(): Promise<{ ok: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/api/test-connection`, {
      method: 'POST',
      headers: this.headers,
    });
    return res.json();
  }

  /** Get schemas config from NET */
  async getSchemasConfig(): Promise<{ schemasJsonExists: boolean; schemaCount: number; schemas: { name: string; collection: string }[] }> {
    const res = await fetch(`${this.baseUrl}/api/schemas-config`, { headers: this.headers });
    return res.json();
  }

  /** Apply schema (create tables) */
  async applySchema(): Promise<{ ok: boolean; message: string; tables?: string[] }> {
    const res = await fetch(`${this.baseUrl}/api/apply-schema`, {
      method: 'POST',
      headers: this.headers,
    });
    return res.json();
  }

  // ── CRUD ─────────────────────────────────────────

  /** Create an entity via REST */
  async create(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const col = this.resolveCollection(collection);
    const res = await fetch(`${this.baseUrl}/api/v1/${col}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (json.status === 'error') throw new Error(json.error?.message || 'Create failed');
    return json.data;
  }

  /** Find one entity by filter */
  async findOne(collection: string, filter: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const col = this.resolveCollection(collection);
    const params = new URLSearchParams({ filter: JSON.stringify(filter), limit: '1' });
    const res = await fetch(`${this.baseUrl}/api/v1/${col}?${params}`, { headers: this.headers });
    const json = await res.json();
    if (json.status === 'error') return null;
    const data = json.data;
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  }

  /** Upsert: find by filter, update if exists, create if not */
  async upsert(collection: string, filter: Record<string, unknown>, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const col = this.resolveCollection(collection);
    const existing = await this.findOne(collection, filter);
    if (existing) {
      const res = await fetch(`${this.baseUrl}/api/v1/${col}/${existing.id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.status === 'error') throw new Error(json.error?.message || 'Update failed');
      return json.data;
    }
    return this.create(collection, data);
  }

  /** Count entities in a collection */
  async count(collection: string, filter?: Record<string, unknown>): Promise<number> {
    const col = this.resolveCollection(collection);
    const params = filter ? new URLSearchParams({ filter: JSON.stringify(filter) }) : '';
    const res = await fetch(`${this.baseUrl}/api/v1/${col}/count${params ? '?' + params : ''}`, { headers: this.headers });
    const json = await res.json();
    return json.data ?? 0;
  }
}
