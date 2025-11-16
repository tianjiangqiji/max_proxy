import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';

// 在 ES 模块中获取当前目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../data/proxy.db');

let db: Database.Database;

export interface ApiEndpoint {
  id?: number;
  url: string;
  api_key: string;
  group_name: string;
  weight: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ApiKey {
  id?: number;
  key_value: string;
  group_name: string;
  expires_at: number; // -1 for permanent, timestamp for specific time
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SystemConfig {
  id?: number;
  key: string;
  value: string;
  description?: string;
  updated_at?: string;
}

export interface AdminUser {
  id?: number;
  username: string;
  password: string;
  created_at?: string;
}

export function initializeDatabase(): void {
  try {
    // Ensure data directory exists
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(dbPath);
    
    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    // Create tables
    createTables();
    
    // Insert default admin user
    insertDefaultAdmin();
    
    // Insert default system config
    insertDefaultConfig();
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

function createTables(): void {
  // API Endpoints table
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_endpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      group_name TEXT NOT NULL,
      weight INTEGER DEFAULT 1,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // API Keys table
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_value TEXT NOT NULL UNIQUE,
      group_name TEXT NOT NULL,
      expires_at INTEGER NOT NULL, -- -1 for permanent, timestamp for specific time
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // System Config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Admin Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Request logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key TEXT NOT NULL,
      endpoint_url TEXT NOT NULL,
      status_code INTEGER,
      response_time INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function insertDefaultAdmin(): void {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM admin_users WHERE username = ?');
  const result = stmt.get('admin') as { count: number };
  
  if (result.count === 0) {
    const hashedPassword = bcrypt.hashSync('123456', 10);
    
    const insertStmt = db.prepare(`
      INSERT INTO admin_users (username, password) VALUES (?, ?)
    `);
    insertStmt.run('admin', hashedPassword);
    console.log('Default admin user created: admin/123456');
  }
}

function insertDefaultConfig(): void {
  const defaultConfigs = [
    { key: 'load_balance_strategy', value: 'round_robin', description: 'Load balancing strategy: round_robin, weight_based, time_based' },
    { key: 'switch_frequency', value: '10', description: 'Number of requests before switching endpoints' },
    { key: 'switch_time_interval', value: '60', description: 'Time interval in seconds for switching endpoints' },
    { key: 'enable_url_switch', value: 'true', description: 'Enable URL switching in load balancing' },
    { key: 'enable_key_switch', value: 'true', description: 'Enable API key switching in load balancing' },
    { key: 'model_ids', value: 'gpt-3.5-turbo,gpt-4,gpt-4-turbo', description: 'Available model IDs, comma-separated' }
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO system_config (key, value, description) VALUES (?, ?, ?)
  `);

  defaultConfigs.forEach(config => {
    stmt.run(config.key, config.value, config.description);
  });
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
  }
}