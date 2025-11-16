import esbuild from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'fs';
import path from 'path';

// 确保输出目录存在
const outputDir = './dist-server';
try {
  rmSync(outputDir, { recursive: true, force: true });
} catch (e) {
  // 目录可能不存在，忽略错误
}
mkdirSync(outputDir, { recursive: true });

// 使用 esbuild 打包后端代码
esbuild.build({
  entryPoints: ['./api/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs', // 使用 CommonJS 格式
  outfile: './dist-server/server.cjs', // 使用 .cjs 扩展名
  external: [
    'better-sqlite3', // 排除原生模块
    'bcrypt', // 排除原生模块
    // Node.js 内置模块
    'fs', 'path', 'url', 'crypto', 'os', 'util', 'events', 'stream', 'buffer',
    'child_process', 'cluster', 'dgram', 'dns', 'http', 'https', 'net', 'readline',
    'repl', 'tls', 'tty', 'zlib', 'assert', 'console', 'constants', 'domain',
    'module', 'perf_hooks', 'process', 'punycode', 'querystring', 'string_decoder',
    'timers', 'v8', 'vm', 'worker_threads', 'inspector', 'async_hooks', 'trace_events',
    'wasi', 'path/posix', 'path/win32', 'fs/promises'
  ],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
  // 不在构建时定义NODE_ENV，让它在运行时确定
  banner: {
    // 在文件开头添加 __filename 和 __dirname 的定义
    js: `
// 在 CommonJS 环境中定义 __filename 和 __dirname
var __filename = require('path').resolve(__filename);
var __dirname = require('path').dirname(__filename);
    `
  }
}).then(() => {
  console.log('Backend bundled successfully!');
  
  // 复制数据库文件
  try {
    mkdirSync('./dist-server/data', { recursive: true });
    copyFileSync('./data/proxy.db', './dist-server/data/proxy.db');
    console.log('Database file copied to dist-server/data/proxy.db');
  } catch (e) {
    console.log('Warning: Could not copy database file:', e.message);
  }
  
  console.log('Backend build completed!');
}).catch(() => process.exit(1));