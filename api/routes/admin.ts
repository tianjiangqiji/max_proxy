import express from 'express';
import bcrypt from 'bcrypt';
import { authenticateToken } from './auth.js';
import {
  getAllApiEndpoints,
  getApiEndpointById,
  getActiveApiEndpoints,
  createApiEndpoint,
  updateApiEndpoint,
  deleteApiEndpoint,
  getAllApiKeys,
  getActiveApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  getAllSystemConfigs,
  updateSystemConfig,
  generateApiKey,
  getRequestStats,
  readRequestLog,
  readRequestLogRaw,
  clearRequestLog
} from '../database/operations.js';
import { refreshLoadBalancer } from '../loadBalancer.js';
import { getDatabase } from '../database.js';

const router = express.Router();
const DEPRECATED_CONFIG_KEYS = new Set(['support_qq_group']);

// All admin routes require authentication
router.use(authenticateToken);

// Dashboard stats
router.get('/stats', (req, res) => {
  try {
    const stats = getRequestStats();
    const endpoints = getActiveApiEndpoints();
    const keys = getActiveApiKeys();
    
    res.json({
      requestStats: stats,
      activeEndpoints: endpoints.length,
      activeKeys: keys.length
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API Endpoints management
router.get('/endpoints', (req, res) => {
  try {
    const endpoints = getAllApiEndpoints();
    res.json(endpoints);
  } catch (error) {
    console.error('Get endpoints error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/endpoints', (req, res) => {
  try {
    const { url, api_key, group_name, weight = 1, is_active = true } = req.body;
    
    if (!url || !api_key || !group_name) {
      return res.status(400).json({ error: 'URL, API key, and group name are required' });
    }

    const endpoint = createApiEndpoint({
      url,
      api_key,
      group_name,
      weight,
      is_active
    });

    refreshLoadBalancer();
    res.json(endpoint);
  } catch (error) {
    console.error('Create endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/endpoints/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;
    
    updateApiEndpoint(id, updates);
    refreshLoadBalancer();
    
    res.json({ message: 'Endpoint updated successfully' });
  } catch (error) {
    console.error('Update endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/endpoints/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    deleteApiEndpoint(id);
    refreshLoadBalancer();
    
    res.json({ message: 'Endpoint deleted successfully' });
  } catch (error) {
    console.error('Delete endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API Keys management
router.get('/keys', (req, res) => {
  try {
    const keys = getAllApiKeys();
    res.json(keys);
  } catch (error) {
    console.error('Get keys error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/keys', (req, res) => {
  try {
    const { group_name, expires_at = -1, is_active = true } = req.body;
    
    if (!group_name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const keyValue = generateApiKey();
    const apiKey = createApiKey({
      key_value: keyValue,
      group_name,
      expires_at: expires_at === -1 ? -1 : Math.floor(new Date(expires_at).getTime() / 1000),
      is_active
    });

    res.json(apiKey);
  } catch (error) {
    console.error('Create key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/keys/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;
    
    if (updates.expires_at && updates.expires_at !== -1) {
      updates.expires_at = Math.floor(new Date(updates.expires_at).getTime() / 1000);
    }
    
    updateApiKey(id, updates);
    res.json({ message: 'Key updated successfully' });
  } catch (error) {
    console.error('Update key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/keys/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    deleteApiKey(id);
    res.json({ message: 'Key deleted successfully' });
  } catch (error) {
    console.error('Delete key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// System configuration
router.get('/config', (req, res) => {
  try {
    const configs = getAllSystemConfigs().filter(config => !DEPRECATED_CONFIG_KEYS.has(config.key));
    res.json(configs);
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/config/:key', (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (DEPRECATED_CONFIG_KEYS.has(key)) {
      console.warn(`Attempt to update deprecated config key: ${key}`);
      return res.status(400).json({ error: 'Configuration key is deprecated' });
    }
    
    if (!value) {
      return res.status(400).json({ error: 'Value is required' });
    }

    updateSystemConfig(key, value);
    refreshLoadBalancer();
    
    res.json({ message: 'Configuration updated successfully' });
  } catch (error) {
    console.error('Update config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch models from specific endpoint for convenience
router.post('/endpoints/:id/fetch-models', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid endpoint ID' });
    }

    const endpoint = getApiEndpointById(id);
    if (!endpoint) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    const baseUrl = endpoint.url.replace(/\/$/, '');
    const modelsUrl = baseUrl.endsWith('/v1')
      ? `${baseUrl}/models`
      : `${baseUrl}/v1/models`;

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${endpoint.api_key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({
        error: 'Failed to fetch models from endpoint',
        details: errorBody
      });
    }

    const data = await response.json() as { data?: Array<{ id?: string }> };
    const modelIds = Array.isArray(data.data)
      ? data.data
          .map((model) => model.id)
          .filter((idValue): idValue is string => Boolean(idValue))
      : [];

    return res.json({ models: modelIds });
  } catch (error) {
    console.error('Fetch models error:', error);
    res.status(500).json({ error: 'Failed to fetch models from endpoint' });
  }
});

// Change password
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const db = getDatabase();
    const stmt = db.prepare('SELECT password FROM admin_users WHERE id = ?');
    const user = stmt.get(userId) as { password: string } | undefined;

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    const updateStmt = db.prepare('UPDATE admin_users SET password = ? WHERE id = ?');
    updateStmt.run(hashedNewPassword, userId);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request log APIs
router.get('/logs/request', (req, res) => {
  try {
    const entries = readRequestLog(200);
    res.json({ entries });
  } catch (error) {
    console.error('Read log error:', error);
    res.status(500).json({ error: '读取日志失败' });
  }
});

router.get('/logs/request/download', (req, res) => {
  try {
    const buffer = readRequestLogRaw();
    if (!buffer) {
      return res.status(404).json({ error: '日志为空' });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="request.log"');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error('Download log error:', error);
    res.status(500).json({ error: '下载日志失败' });
  }
});

router.delete('/logs/request', (req, res) => {
  try {
    clearRequestLog();
    res.json({ message: '日志已清空' });
  } catch (error) {
    console.error('Clear log error:', error);
    res.status(500).json({ error: '清空日志失败' });
  }
});

export default router;
