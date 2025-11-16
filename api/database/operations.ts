import { getDatabase } from '../database';
import type { ApiEndpoint, ApiKey, SystemConfig } from '../database';



// API Endpoint operations
export function getAllApiEndpoints(): ApiEndpoint[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM api_endpoints ORDER BY id DESC');
  const endpoints = stmt.all() as ApiEndpoint[];
  
  // Convert integer boolean values back to JavaScript boolean
  return endpoints.map(endpoint => ({
    ...endpoint,
    is_active: Boolean(endpoint.is_active)
  }));
}

export function getActiveApiEndpoints(): ApiEndpoint[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM api_endpoints WHERE is_active = 1 ORDER BY id DESC');
  return stmt.all() as ApiEndpoint[];
}

export function getApiEndpointsByGroup(groupName: string): ApiEndpoint[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM api_endpoints WHERE group_name = ? AND is_active = 1 ORDER BY id DESC');
  const endpoints = stmt.all(groupName) as ApiEndpoint[];
  
  // Convert integer boolean values back to JavaScript boolean
  return endpoints.map(endpoint => ({
    ...endpoint,
    is_active: Boolean(endpoint.is_active)
  }));
}

export function createApiEndpoint(endpoint: Omit<ApiEndpoint, 'id' | 'created_at' | 'updated_at'>): ApiEndpoint {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO api_endpoints (url, api_key, group_name, weight, is_active)
    VALUES (?, ?, ?, ?, ?)
  `);
  // Convert boolean to integer for SQLite compatibility
  const isActiveInt = endpoint.is_active ? 1 : 0;
  const result = stmt.run(endpoint.url, endpoint.api_key, endpoint.group_name, endpoint.weight, isActiveInt);
  
  return {
    id: result.lastInsertRowid as number,
    ...endpoint,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export function updateApiEndpoint(id: number, endpoint: Partial<ApiEndpoint>): void {
  const fields = [];
  const values = [];
  
  if (endpoint.url !== undefined) {
    fields.push('url = ?');
    values.push(endpoint.url);
  }
  if (endpoint.api_key !== undefined) {
    fields.push('api_key = ?');
    values.push(endpoint.api_key);
  }
  if (endpoint.group_name !== undefined) {
    fields.push('group_name = ?');
    values.push(endpoint.group_name);
  }
  if (endpoint.weight !== undefined) {
    fields.push('weight = ?');
    values.push(endpoint.weight);
  }
  if (endpoint.is_active !== undefined) {
    fields.push('is_active = ?');
    // Convert boolean to integer for SQLite compatibility
    values.push(endpoint.is_active ? 1 : 0);
  }
  
  if (fields.length === 0) return;
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE api_endpoints SET ${fields.join(', ')} WHERE id = ?
  `);
  stmt.run(...values);
}

export function deleteApiEndpoint(id: number): void {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM api_endpoints WHERE id = ?');
  stmt.run(id);
}

// API Key operations
export function getAllApiKeys(): ApiKey[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM api_keys ORDER BY id DESC');
  const keys = stmt.all() as ApiKey[];
  
  // Convert integer boolean values back to JavaScript boolean
  return keys.map(key => ({
    ...key,
    is_active: Boolean(key.is_active)
  }));
}

export function getActiveApiKeys(): ApiKey[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM api_keys WHERE is_active = 1 ORDER BY id DESC');
  const keys = stmt.all() as ApiKey[];
  
  // Convert integer boolean values back to JavaScript boolean
  return keys.map(key => ({
    ...key,
    is_active: Boolean(key.is_active)
  }));
}

export function getApiKeyByValue(keyValue: string): ApiKey | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM api_keys WHERE key_value = ?');
  return stmt.get(keyValue) as ApiKey | null;
}

export function getApiKeysByGroup(groupName: string): ApiKey[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM api_keys WHERE group_name = ? AND is_active = 1 ORDER BY id DESC');
  const keys = stmt.all(groupName) as ApiKey[];
  
  // Convert integer boolean values back to JavaScript boolean
  return keys.map(key => ({
    ...key,
    is_active: Boolean(key.is_active)
  }));
}

export function createApiKey(key: Omit<ApiKey, 'id' | 'created_at' | 'updated_at'>): ApiKey {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO api_keys (key_value, group_name, expires_at, is_active)
    VALUES (?, ?, ?, ?)
  `);
  // Convert boolean to integer for SQLite compatibility
  const isActiveInt = key.is_active ? 1 : 0;
  const result = stmt.run(key.key_value, key.group_name, key.expires_at, isActiveInt);
  
  return {
    id: result.lastInsertRowid as number,
    ...key,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export function updateApiKey(id: number, key: Partial<ApiKey>): void {
  const fields = [];
  const values = [];
  
  if (key.group_name !== undefined) {
    fields.push('group_name = ?');
    values.push(key.group_name);
  }
  if (key.expires_at !== undefined) {
    fields.push('expires_at = ?');
    values.push(key.expires_at);
  }
  if (key.is_active !== undefined) {
    fields.push('is_active = ?');
    // Convert boolean to integer for SQLite compatibility
    values.push(key.is_active ? 1 : 0);
  }
  
  if (fields.length === 0) return;
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE api_keys SET ${fields.join(', ')} WHERE id = ?
  `);
  stmt.run(...values);
}

export function deleteApiKey(id: number): void {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM api_keys WHERE id = ?');
  stmt.run(id);
}

// System Config operations
export function getSystemConfig(key: string): string | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT value FROM system_config WHERE key = ?');
  const result = stmt.get(key) as { value: string } | null;
  return result?.value || null;
}

export function getAllSystemConfigs(): SystemConfig[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM system_config ORDER BY key');
  return stmt.all() as SystemConfig[];
}

export function updateSystemConfig(key: string, value: string): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE system_config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?
  `);
  stmt.run(value, key);
}

// Request logging
export function logRequest(apiKey: string, endpointUrl: string, statusCode: number, responseTime: number): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO request_logs (api_key, endpoint_url, status_code, response_time)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(apiKey, endpointUrl, statusCode, responseTime);
}

// Statistics
export function getRequestStats(): { total: number; success: number; error: number } {
  const db = getDatabase();
  const totalStmt = db.prepare('SELECT COUNT(*) as count FROM request_logs');
  const successStmt = db.prepare('SELECT COUNT(*) as count FROM request_logs WHERE status_code >= 200 AND status_code < 300');
  const errorStmt = db.prepare('SELECT COUNT(*) as count FROM request_logs WHERE status_code >= 400');
  
  const total = (totalStmt.get() as { count: number }).count;
  const success = (successStmt.get() as { count: number }).count;
  const error = (errorStmt.get() as { count: number }).count;
  
  return { total, success, error };
}

// Utility functions
export function isApiKeyValid(key: ApiKey): boolean {
  if (!key.is_active) return false;
  
  if (key.expires_at === -1) return true; // Permanent key
  
  const now = Math.floor(Date.now() / 1000);
  return key.expires_at > now;
}

export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `sk-${result}`;
}