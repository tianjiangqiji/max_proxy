import express from 'express';
import { getApiKeyByValue, isApiKeyValid, getSystemConfig } from '../database/operations';

const router = express.Router();
const DEFAULT_PURCHASE_URL = 'https://qm.qq.com/q/a76O4CjZAI';
const DEFAULT_PURCHASE_LABEL = '立即获取！';

function buildApiServerUrl(req: express.Request): string {
  const envBackendUrl = (process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || '').replace(/\/$/, '');
  if (envBackendUrl) {
    const normalized = envBackendUrl.replace(/\/$/, '');
    if (normalized.endsWith('/api')) {
      return `${normalized}/v1`;
    }
    if (normalized.endsWith('/api/v1')) {
      return normalized;
    }
    return `${normalized}/api/v1`;
  }
  return `${req.protocol}://${req.get('host')}/api/v1`;
}

// Query API key information
router.get('/query/:key', (req, res) => {
  try {
    const { key } = req.params;
    
    if (!key) {
      return res.status(400).json({ error: 'API key 不能为空' });
    }

    const keyRecord = getApiKeyByValue(key);
    
    if (!keyRecord) {
      return res.status(404).json({ error: '未找到该 API key' });
    }

    const isValid = isApiKeyValid(keyRecord);
    
    res.json({
      key_value: keyRecord.key_value,
      group_name: keyRecord.group_name,
      expires_at: keyRecord.expires_at,
      is_active: keyRecord.is_active,
      is_valid: isValid,
      created_at: keyRecord.created_at,
      updated_at: keyRecord.updated_at
    });
  } catch (error) {
    console.error('Query key error:', error);
    res.status(500).json({ error: '查询 API key 信息失败' });
  }
});

// Get system information (model IDs, server URL)
router.get('/info', (req, res) => {
  try {
    const modelIds = getSystemConfig('model_ids') || 'gpt-3.5-turbo,gpt-4,gpt-4-turbo';
    const serverUrl = buildApiServerUrl(req);
    const purchaseUrl = getSystemConfig('api_key_purchase_url') || DEFAULT_PURCHASE_URL;
    const purchaseLabel = getSystemConfig('purchase_button_label') || DEFAULT_PURCHASE_LABEL;
    
    res.json({
      server_url: serverUrl,
      model_ids: modelIds.split(',').map(id => id.trim()),
      purchase_url: purchaseUrl,
      purchase_button_label: purchaseLabel
    });
  } catch (error) {
    console.error('Get info error:', error);
    res.status(500).json({ error: '获取系统信息失败' });
  }
});

// Health check for API keys
router.post('/validate', (req, res) => {
  try {
    const { key } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'API key 不能为空' });
    }

    const keyRecord = getApiKeyByValue(key);
    
    if (!keyRecord) {
      return res.json({ valid: false, message: '未找到该 API key' });
    }

    const isValid = isApiKeyValid(keyRecord);
    
    res.json({
      valid: isValid,
      message: isValid ? '该 API key 有效' : '该 API key 已过期或已停用',
      group_name: keyRecord.group_name,
      expires_at: keyRecord.expires_at
    });
  } catch (error) {
    console.error('Validate key error:', error);
    res.status(500).json({ error: '验证 API key 失败' });
  }
});

export default router;
