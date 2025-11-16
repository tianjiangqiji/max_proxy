import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { initializeDatabase } from './database.js';
import { getLoadBalancer } from './loadBalancer.js';
import { getApiKeyByValue, isApiKeyValid } from './database/operations.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import apiRoutes from './routes/api.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
initializeDatabase();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Key validation middleware
async function validateApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key is required' });
  }

  try {
    const keyRecord = getApiKeyByValue(apiKey);
    
    if (!keyRecord) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (!isApiKeyValid(keyRecord)) {
      return res.status(401).json({ error: 'API key is expired or inactive' });
    }

    // Store API key info in request for later use
    req.apiKey = apiKey;
    req.apiKeyGroup = keyRecord.group_name;
    
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Load balancer middleware
function loadBalancerMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const loadBalancer = getLoadBalancer();
    const currentEndpoint = loadBalancer.getNextEndpoint();
    
    if (!currentEndpoint) {
      return res.status(503).json({ error: 'No available API endpoints' });
    }

    // Store endpoint info in request for proxy middleware
    req.targetEndpoint = currentEndpoint.endpoint;
    
    next();
  } catch (error) {
    console.error('Load balancer error:', error);
    res.status(503).json({ error: 'Service unavailable' });
  }
}

// Proxy middleware for API requests
const proxyMiddleware = createProxyMiddleware({
  target: 'http://localhost', // Will be overridden by load balancer
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1': '/v1', // Remove /api prefix
  },
  router: (req: express.Request) => {
    return req.targetEndpoint?.url || 'http://localhost';
  },
  on: {
    proxyReq: (proxyReq, req: express.Request) => {
      // Add API key from the selected endpoint
      if (req.targetEndpoint?.api_key) {
        proxyReq.setHeader('Authorization', `Bearer ${req.targetEndpoint.api_key}`);
      }
      
      // Add custom headers
      proxyReq.setHeader('X-Forwarded-For', req.ip);
      proxyReq.setHeader('X-Original-API-Key', req.apiKey || '');
    },
    proxyRes: (proxyRes, req: express.Request) => {
      // Log the request
      const loadBalancer = getLoadBalancer();
      const responseTime = Date.now() - (req.startTime || Date.now());
      loadBalancer.logApiRequest(req.apiKey || '', proxyRes.statusCode || 0, responseTime);
      
      // 如果响应成功，标记端点为成功
      if (proxyRes.statusCode && proxyRes.statusCode < 400) {
        loadBalancer.markEndpointSuccess(req.targetEndpoint?.url || '');
      }
    },
    error: (err: unknown, req: express.Request, res: express.Response) => {
      // 只在开发环境中详细记录代理错误
      if (process.env.NODE_ENV === 'development') {
        console.error('Proxy error:', err);
      }
      
      // 标记端点失败
      const loadBalancer = getLoadBalancer();
      loadBalancer.markEndpointFailure(req.targetEndpoint?.url || '');
      
      // 尝试获取下一个可用的端点
      try {
        const nextEndpoint = loadBalancer.getNextEndpoint();
        
        if (nextEndpoint && nextEndpoint.endpoint !== req.targetEndpoint) {
          // 更新请求的目标端点
          req.targetEndpoint = nextEndpoint.endpoint;
          
          // 尝试重新代理请求
          return proxyMiddleware(req, res);
        }
      } catch (error) {
        // 忽略获取下一个端点的错误
      }
      
      // 如果没有其他端点可用，返回适当的错误响应
      if (!res.headersSent) {
        res.status(502).json({ 
          error: 'Service temporarily unavailable',
          message: 'The upstream service is currently experiencing issues. Please try again later.'
        });
      }
    }
  },
  timeout: 30000, // 30 second timeout
});

// Routes
app.use('/api/admin/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/keys', apiRoutes);

// Main proxy route - this handles the actual API proxying
app.use('/api/v1/*', validateApiKey, loadBalancerMiddleware, (req, res, next) => {
  req.startTime = Date.now(); // Add start time for logging
  next();
}, proxyMiddleware);

// Catch all route for 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  void next
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' && err instanceof Error ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Proxy Server running on port ${PORT}`);
  console.log(`📊 Admin panel: http://localhost:${PORT}/api/admin`);
  console.log(`🔑 API endpoint: http://localhost:${PORT}/api/v1/*`);
  
  // 在生产模式下自动启动前端静态文件服务器
  if (process.env.NODE_ENV === 'production') {
    serveFrontend();
  }
});

// 在生产模式下启动前端静态文件服务器
function serveFrontend() {
  try {
    // 获取当前文件的目录路径
    // 在CommonJS环境中使用__filename和__dirname
    const distServerDir = __dirname;
    
    // 找到dist目录的路径
    const distDir = join(distServerDir, '..', 'dist');
    
    // 检查dist目录是否存在
    if (!existsSync(distDir)) {
      console.log(`⚠️ Frontend dist directory not found at ${distDir}`);
      return;
    }
    
    // 创建前端应用
    const frontendApp = express();
    frontendApp.use(express.static(distDir));
    
    // 所有路由都返回index.html（用于SPA）
    frontendApp.get('*', (req, res) => {
      res.sendFile(join(distDir, 'index.html'));
    });
    
    // 启动前端服务器，使用不同的端口
    const frontendPort = process.env.FRONTEND_PORT || 3000;
    frontendApp.listen(frontendPort, () => {
      console.log(`🌐 Frontend server running on port ${frontendPort}`);
      console.log(`🔗 Frontend URL: http://localhost:${frontendPort}`);
    });
  } catch (error) {
    console.error('Failed to start frontend server:', error);
  }
}

export default app;