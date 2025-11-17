import { useState, useEffect, useMemo, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { apiFetch } from '@/lib/apiClient';

interface ApiEndpoint {
  id: number;
  url: string;
  api_key: string;
  group_name: string;
  weight: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ApiKey {
  id: number;
  key_value: string;
  group_name: string;
  expires_at: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SystemConfig {
  id: number;
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}

interface DashboardStats {
  requestStats: { total: number; success: number; error: number };
  activeEndpoints: number;
  activeKeys: number;
}

interface RequestLogEntry {
  timestamp: string;
  client_api_key: string;
  endpoint_url: string;
  endpoint_api_key: string;
  endpoint_group: string;
  platform_api: string;
  status_code: number;
  response_time: number;
}

interface AdminDashboardProps {
  token: string;
  onLogout: () => void;
}

type CreateEndpointPayload = {
  url: string;
  group_name: string;
  weight: number;
  is_active: boolean;
  api_key?: string;
  api_keys?: string[];
};

const SUGGESTION_DISPLAY_LIMIT = 6;
const LOG_REFRESH_INTERVAL = 5000;

export function AdminDashboard({ token, onLogout }: AdminDashboardProps) {
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // Endpoint dialog states
  const [isEndpointDialogOpen, setIsEndpointDialogOpen] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [endpointApiKey, setEndpointApiKey] = useState('');
  const [endpointGroupName, setEndpointGroupName] = useState('');
  const [endpointWeight, setEndpointWeight] = useState(1);
  const [isCreatingEndpoint, setIsCreatingEndpoint] = useState(false);
  const [isEndpointEditDialogOpen, setIsEndpointEditDialogOpen] = useState(false);
  const [editingEndpointId, setEditingEndpointId] = useState<number | null>(null);
  const [editingEndpointUrl, setEditingEndpointUrl] = useState('');
  const [editingEndpointApiKey, setEditingEndpointApiKey] = useState('');
  const [editingEndpointGroupName, setEditingEndpointGroupName] = useState('');
  const [editingEndpointWeight, setEditingEndpointWeight] = useState(1);
  const [editingEndpointActive, setEditingEndpointActive] = useState(true);
  const [isSavingEndpoint, setIsSavingEndpoint] = useState(false);
  const [isEndpointDeleteDialogOpen, setIsEndpointDeleteDialogOpen] = useState(false);
  const [endpointToDelete, setEndpointToDelete] = useState<ApiEndpoint | null>(null);
  const [isDeletingEndpoint, setIsDeletingEndpoint] = useState(false);
  const [requestLogs, setRequestLogs] = useState<RequestLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [isDownloadingLogs, setIsDownloadingLogs] = useState(false);
  const [endpointGroupFilter, setEndpointGroupFilter] = useState('');
  const [endpointUrlFilter, setEndpointUrlFilter] = useState('');
  const [showEndpointFilters, setShowEndpointFilters] = useState(false);
  
  // API Key dialog states
  const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);
  const [keyGroupName, setKeyGroupName] = useState('');
  const [keyExpiresAt, setKeyExpiresAt] = useState(-1);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [isKeyDeleteDialogOpen, setIsKeyDeleteDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null);
  const [isDeletingKey, setIsDeletingKey] = useState(false);

  // Model config helper states
  const [modelFetchEndpointId, setModelFetchEndpointId] = useState('');
  const [isFetchingModelIds, setIsFetchingModelIds] = useState(false);
  
  const { toast } = useToast();

  const CONFIG_I18N: Record<string, { label: string; placeholder: string; description: string }> = {
    load_balance_strategy: {
      label: '负载均衡策略',
      placeholder: 'round_robin | weight_based | time_based',
      description: '从 round_robin、weight_based、time_based 中选择（分别为轮询、权重、时间）'
    },
    switch_frequency: {
      label: '切换频率（轮询）',
      placeholder: '数字，例如 10',
      description: '累计请求数达到该值时切换到下一个端点'
    },
    switch_time_interval: {
      label: '时间片（秒）',
      placeholder: '数字，例如 60',
      description: '每个端点的持续时间，单位为秒'
    },
    enable_url_switch: {
      label: '启用 URL 维度切换',
      placeholder: 'true | false',
      description: '根据不同目标 URL 进行负载切换（true/false）'
    },
    enable_key_switch: {
      label: '启用密钥维度切换',
      placeholder: 'true | false',
      description: '根据不同客户端 API Key 进行负载切换（true/false）'
    },
    model_ids: {
      label: '可用模型列表',
      placeholder: '逗号分隔的模型 ID',
      description: '用于前端展示的模型 ID 列表（逗号分隔）'
    },
    api_key_purchase_url: {
      label: 'API Key 获取链接',
      placeholder: 'https://example.com',
      description: '点击按钮后跳转的链接地址'
    },
    purchase_button_label: {
      label: '按钮显示文字',
      placeholder: '例如：立即获取！',
      description: '展示在按钮上的文案，将与跳转链接一起作用'
    }
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [endpointsRes, keysRes, configsRes, statsRes] = await Promise.all([
        apiFetch('/api/admin/endpoints', { headers: { 'Authorization': `Bearer ${token}` } }),
        apiFetch('/api/admin/keys', { headers: { 'Authorization': `Bearer ${token}` } }),
        apiFetch('/api/admin/config', { headers: { 'Authorization': `Bearer ${token}` } }),
        apiFetch('/api/admin/stats', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (!endpointsRes.ok || !keysRes.ok || !configsRes.ok || !statsRes.ok) {
        throw new Error('获取数据失败');
      }

      const [endpointsData, keysData, configsData, statsData] = await Promise.all([
        endpointsRes.json(),
        keysRes.json(),
        configsRes.json(),
        statsRes.json()
      ]);

      setEndpoints(endpointsData);
      setKeys(keysData);
      setConfigs(configsData);
      setStats(statsData);
    } catch (error) {
      console.error(error);
      toast({
        title: '错误',
        description: '获取数据失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const uniqueGroups = useMemo(
    () => Array.from(new Set(endpoints.map(endpoint => endpoint.group_name))).filter(Boolean),
    [endpoints]
  );
  const uniqueUrls = useMemo(
    () => Array.from(new Set(endpoints.map(endpoint => endpoint.url))).filter(Boolean),
    [endpoints]
  );
  const filteredEndpoints = useMemo(() => {
    const groupFilter = endpointGroupFilter.trim();
    const urlFilter = endpointUrlFilter.trim().toLowerCase();

    return endpoints.filter((endpoint) => {
      const matchGroup = groupFilter ? endpoint.group_name === groupFilter : true;
      const matchUrl = urlFilter ? endpoint.url.toLowerCase().includes(urlFilter) : true;
      return matchGroup && matchUrl;
    });
  }, [endpoints, endpointGroupFilter, endpointUrlFilter]);
  const hasEndpointFilters = Boolean(endpointGroupFilter.trim() || endpointUrlFilter.trim());
  const endpointUrlListId = 'endpoint-url-options';
  const endpointGroupListId = 'endpoint-group-options';
  const urlSuggestions = uniqueUrls.slice(0, SUGGESTION_DISPLAY_LIMIT);
  const groupSuggestions = uniqueGroups.slice(0, SUGGESTION_DISPLAY_LIMIT);
  const baseSelectClasses = 'h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700';

  useEffect(() => {
    if (!modelFetchEndpointId && endpoints.length > 0) {
      setModelFetchEndpointId(String(endpoints[0].id));
    }
  }, [endpoints, modelFetchEndpointId]);

  useEffect(() => {
    if (!keyGroupName && uniqueGroups.length > 0) {
      setKeyGroupName(uniqueGroups[0]);
    }
  }, [uniqueGroups, keyGroupName]);

  const fetchRequestLogs = useCallback(async () => {
    try {
      const response = await apiFetch('/api/admin/logs/request', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('获取日志失败');
      const data = await response.json() as { entries: RequestLogEntry[] };
      setRequestLogs(data.entries ?? []);
    } catch (error) {
      console.error(error);
    }
  }, [token]);

  useEffect(() => {
    const loadLogs = async () => {
      setIsLoadingLogs(true);
      await fetchRequestLogs();
      setIsLoadingLogs(false);
    };

    loadLogs();
    const interval = window.setInterval(loadLogs, LOG_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchRequestLogs]);

  const renderSuggestionButtons = (
    items: string[],
    onSelect: (value: string) => void,
    keyPrefix: string
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">已有记录（点击自动填充）</p>
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <button
              key={`${keyPrefix}-${item}`}
              type="button"
              className="max-w-[240px] truncate rounded-md border border-dashed px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={() => onSelect(item)}
              title={item}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const validatedEndpointKeys = (rawValue: string) =>
    rawValue
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

  // Create endpoint
  const createEndpoint = async (endpointData: CreateEndpointPayload) => {
    try {
      const response = await apiFetch('/api/admin/endpoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(endpointData)
      });

      if (!response.ok) throw new Error('创建端点失败');

      const result = await response.json() as { endpoints?: ApiEndpoint[] } | ApiEndpoint[];
      let createdList: ApiEndpoint[] = [];
      if (Array.isArray(result)) {
        createdList = result;
      } else if (Array.isArray(result.endpoints)) {
        createdList = result.endpoints;
      }

      if (createdList.length === 0) {
        throw new Error('未能创建端点');
      }

      setEndpoints((prev) => [...createdList, ...prev]);
      // 再拉取一次，确保界面数据与后端完全同步（避免需要手动刷新）
      await fetchData();
      toast({
        title: '成功',
        description: createdList.length > 1 ? `已创建 ${createdList.length} 个端点` : '端点创建成功'
      });
    } catch (error) {
      console.error(error);
      toast({
        title: '错误',
        description: '创建端点失败',
        variant: 'destructive',
      });
    }
  };

  const updateEndpoint = async (id: number, endpointData: Omit<ApiEndpoint, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const response = await apiFetch(`/api/admin/endpoints/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(endpointData)
      });

      if (!response.ok) throw new Error('更新端点失败');

      setEndpoints((prev) =>
        prev.map((endpoint) =>
          endpoint.id === id
            ? { ...endpoint, ...endpointData, updated_at: new Date().toISOString() }
            : endpoint
        )
      );
      toast({ title: '成功', description: '端点更新成功' });
    } catch (error) {
      console.error(error);
      toast({
        title: '错误',
        description: '更新端点失败',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const deleteEndpoint = async (id: number) => {
    try {
      const response = await apiFetch(`/api/admin/endpoints/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('删除端点失败');

      setEndpoints((prev) => prev.filter((endpoint) => endpoint.id !== id));
      toast({ title: '成功', description: '端点已删除' });
    } catch (error) {
      console.error(error);
      toast({
        title: '错误',
        description: '删除端点失败',
        variant: 'destructive',
      });
      throw error;
    }
  };

  // Create API key
  const createApiKey = async (keyData: Omit<ApiKey, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const response = await apiFetch('/api/admin/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(keyData)
      });

      if (!response.ok) throw new Error('创建密钥失败');

      const newKey = await response.json();
      setKeys((prev) => [newKey, ...prev]);
      toast({ title: '成功', description: 'API 密钥创建成功' });
    } catch (error) {
      console.error(error);
      toast({
        title: '错误',
        description: '创建密钥失败',
        variant: 'destructive',
      });
    }
  };

  const deleteApiKey = async (id: number) => {
    try {
      const response = await apiFetch(`/api/admin/keys/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('删除密钥失败');

      setKeys((prev) => prev.filter((key) => key.id !== id));
      toast({ title: '成功', description: 'API 密钥已删除' });
    } catch (error) {
      console.error(error);
      toast({
        title: '错误',
        description: '删除密钥失败',
        variant: 'destructive',
      });
      throw error;
    }
  };

  // Update config
  const updateConfig = async (key: string, value: string) => {
    try {
      const response = await apiFetch(`/api/admin/config/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ value })
      });

      if (!response.ok) throw new Error('更新配置失败');

      setConfigs(configs.map(config => 
        config.key === key ? { ...config, value, updated_at: new Date().toISOString() } : config
      ));
      toast({ title: '成功', description: '配置更新成功' });
    } catch (error) {
      console.error(error);
      toast({
        title: '错误',
        description: '更新配置失败',
        variant: 'destructive',
      });
    }
  };

  const handleFetchModelIds = async () => {
    if (!modelFetchEndpointId) {
      toast({
        title: '提示',
        description: '请先选择要检测的端点',
        variant: 'destructive'
      });
      return;
    }

    setIsFetchingModelIds(true);
    try {
      const response = await apiFetch(`/api/admin/endpoints/${modelFetchEndpointId}/fetch-models`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || '获取模型列表失败');
      }

      const data = await response.json() as { models?: string[] };
      const models = data.models ?? [];

      if (models.length === 0) {
        toast({
          title: '提示',
          description: '该端点未返回任何模型 ID',
        });
      } else {
        const mergedModels = models.join(',');
        setConfigs(prev => prev.map(config =>
          config.key === 'model_ids' ? { ...config, value: mergedModels } : config
        ));
        toast({
          title: '已填入',
          description: '模型 ID 已写入输入框，请记得点击“更新”按钮保存。',
        });
      }
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '获取模型列表失败',
        variant: 'destructive'
      });
    } finally {
      setIsFetchingModelIds(false);
    }
  };

  const resetEndpointEditState = () => {
    setEditingEndpointId(null);
    setEditingEndpointUrl('');
    setEditingEndpointApiKey('');
    setEditingEndpointGroupName('');
    setEditingEndpointWeight(1);
    setEditingEndpointActive(true);
  };

  const openEndpointEditDialog = (endpoint: ApiEndpoint) => {
    setEditingEndpointId(endpoint.id);
    setEditingEndpointUrl(endpoint.url);
    setEditingEndpointApiKey(endpoint.api_key);
    setEditingEndpointGroupName(endpoint.group_name);
    setEditingEndpointWeight(endpoint.weight);
    setEditingEndpointActive(endpoint.is_active);
    setIsEndpointEditDialogOpen(true);
  };

  const handleUpdateEndpoint = async () => {
    if (!editingEndpointId) return;

    if (!editingEndpointUrl || !editingEndpointApiKey || !editingEndpointGroupName) {
      toast({
        title: '错误',
        description: '请填写所有必填字段',
        variant: 'destructive'
      });
      return;
    }

    setIsSavingEndpoint(true);
    try {
      await updateEndpoint(editingEndpointId, {
        url: editingEndpointUrl,
        api_key: editingEndpointApiKey,
        group_name: editingEndpointGroupName,
        weight: editingEndpointWeight,
        is_active: editingEndpointActive
      });
      setIsEndpointEditDialogOpen(false);
      resetEndpointEditState();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSavingEndpoint(false);
    }
  };

  const handleDeleteEndpoint = async () => {
    if (!endpointToDelete) return;
    setIsDeletingEndpoint(true);
    try {
      await deleteEndpoint(endpointToDelete.id);
      setEndpointToDelete(null);
      setIsEndpointDeleteDialogOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsDeletingEndpoint(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!keyToDelete) return;
    setIsDeletingKey(true);
    try {
      await deleteApiKey(keyToDelete.id);
      setKeyToDelete(null);
      setIsKeyDeleteDialogOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsDeletingKey(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: '错误',
        description: '新密码和确认密码不匹配',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: '错误',
        description: '新密码长度至少为6位',
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to change password');
      }

      toast({
        title: '成功',
        description: '密码已修改',
      });
      
      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsPasswordDialogOpen(false);
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '修改密码失败',
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Handle create endpoint
  const handleCreateEndpoint = async () => {
    const trimmedUrl = endpointUrl.trim();
    const trimmedGroupName = endpointGroupName.trim();
    if (!trimmedUrl || !trimmedGroupName) {
      toast({
        title: '错误',
        description: '请填写所有必填字段',
        variant: 'destructive',
      });
      return;
    }

    const apiKeys = validatedEndpointKeys(endpointApiKey);
    if (apiKeys.length === 0) {
      toast({
        title: '错误',
        description: '至少输入一个 API Key',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingEndpoint(true);
    try {
      await createEndpoint({
        url: trimmedUrl,
        api_keys: apiKeys,
        group_name: trimmedGroupName,
        weight: endpointWeight,
        is_active: true
      });

      // Reset form
      setEndpointUrl('');
      setEndpointApiKey('');
      setEndpointGroupName('');
      setEndpointWeight(1);
      setIsEndpointDialogOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsCreatingEndpoint(false);
    }
  };

  const calculateExpiresAt = (days: number): number | string => {
    if (days === -1) return -1;
    const clampedDays = Math.max(days, 0);
    const expiresDate = new Date();
    expiresDate.setDate(expiresDate.getDate() + clampedDays);
    return expiresDate.toISOString();
  };

  // Handle create API key
  const handleCreateKey = async () => {
    if (!keyGroupName) {
      toast({
        title: '错误',
        description: '请选择分组名称',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingKey(true);
    try {
      const normalizedExpiresAt = calculateExpiresAt(keyExpiresAt);
      await createApiKey({
        key_value: '', // Will be generated server-side
        group_name: keyGroupName,
        expires_at: normalizedExpiresAt,
        is_active: true
      });

      // Reset form
      setKeyGroupName('');
      setKeyExpiresAt(-1);
      setIsKeyDialogOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRefreshLogs = async () => {
    setIsLoadingLogs(true);
    await fetchRequestLogs();
    setIsLoadingLogs(false);
  };

  const handleDownloadLogs = async () => {
    setIsDownloadingLogs(true);
    try {
      const response = await apiFetch('/api/admin/logs/request/download', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('下载日志失败');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'request.log';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '下载日志失败',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingLogs(false);
    }
  };

  const handleClearLogs = async () => {
    setIsClearingLogs(true);
    try {
      const response = await apiFetch('/api/admin/logs/request', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('清空日志失败');
      toast({ title: '成功', description: '日志已清空' });
      setRequestLogs([]);
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '清空日志失败',
        variant: 'destructive',
      });
    } finally {
      setIsClearingLogs(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Toaster />
      <datalist id={endpointUrlListId}>
        {uniqueUrls.map((url) => (
          <option key={`url-${url}`} value={url} />
        ))}
      </datalist>
      <datalist id={endpointGroupListId}>
        {uniqueGroups.map((group) => (
          <option key={`group-${group}`} value={group} />
        ))}
      </datalist>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">管理后台</h1>
          <div className="flex space-x-2">
            <Button onClick={() => setIsPasswordDialogOpen(true)} variant="outline">
              修改密码
            </Button>
            <Button onClick={onLogout} variant="outline">
              退出登录
            </Button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>总请求数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.requestStats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>成功率</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {stats.requestStats.total > 0 
                    ? Math.round((stats.requestStats.success / stats.requestStats.total) * 100) 
                    : 0}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>活跃资源</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <div>端点：{stats.activeEndpoints}</div>
                  <div>密钥：{stats.activeKeys}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="endpoints" className="space-y-4">
          <TabsList>
            <TabsTrigger value="endpoints">API 端点</TabsTrigger>
            <TabsTrigger value="keys">API 密钥</TabsTrigger>
            <TabsTrigger value="config">系统配置</TabsTrigger>
            <TabsTrigger value="logs">请求日志</TabsTrigger>
          </TabsList>

          <TabsContent value="endpoints" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">API 端点</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={showEndpointFilters ? 'default' : 'outline'}
                  onClick={() => setShowEndpointFilters((prev) => !prev)}
                  className="relative"
                >
                  {showEndpointFilters ? '收起筛选' : '展开筛选'}
                  {hasEndpointFilters && !showEndpointFilters && (
                    <span className="absolute -right-1 -top-1 inline-flex h-2 w-2 rounded-full bg-red-500" />
                  )}
                </Button>
                <Button onClick={() => setIsEndpointDialogOpen(true)}>
                  新增端点
                </Button>
              </div>
            </div>
            {showEndpointFilters && (
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <div className="text-sm font-medium">筛选端点</div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="endpoint-filter-group" className="text-sm">按分组筛选</Label>
                      <select
                        id="endpoint-filter-group"
                        className={baseSelectClasses}
                        value={endpointGroupFilter}
                        onChange={(e) => setEndpointGroupFilter(e.target.value)}
                      >
                        <option value="">全部分组</option>
                        {uniqueGroups.map((group) => (
                          <option key={`filter-group-${group}`} value={group}>{group}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label htmlFor="endpoint-filter-url" className="text-sm">按 URL 筛选（支持模糊）</Label>
                      <Input
                        id="endpoint-filter-url"
                        value={endpointUrlFilter}
                        onChange={(e) => setEndpointUrlFilter(e.target.value)}
                        placeholder="输入 URL 关键词"
                      />
                    </div>
                  </div>
                  {hasEndpointFilters && (
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>
                        当前筛选：{endpointGroupFilter ? `分组 = ${endpointGroupFilter}` : ''}{endpointGroupFilter && endpointUrlFilter ? '，' : ''}{endpointUrlFilter ? `URL 包含 \"${endpointUrlFilter}\"` : ''}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2"
                        onClick={() => {
                          setEndpointGroupFilter('');
                          setEndpointUrlFilter('');
                        }}
                      >
                        清除筛选
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            <div className="grid gap-4">
              {filteredEndpoints.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-sm text-gray-500 dark:text-gray-400">
                    {endpoints.length === 0
                      ? '暂无 API 端点，请先新增。'
                      : '没有匹配的端点，请调整筛选条件。'}
                  </CardContent>
                </Card>
              ) : (
                filteredEndpoints.map((endpoint) => (
                  <Card key={endpoint.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="font-medium">{endpoint.url}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            分组：{endpoint.group_name} | 权重：{endpoint.weight}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            状态：{endpoint.is_active ? '启用' : '停用'}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEndpointEditDialog(endpoint)}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setEndpointToDelete(endpoint);
                              setIsEndpointDeleteDialogOpen(true);
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="keys" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">API 密钥</h2>
              <Button onClick={() => setIsKeyDialogOpen(true)}>
                生成密钥
              </Button>
            </div>
            <div className="grid gap-4">
              {keys.map((key) => (
                <Card key={key.id}>
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="font-mono text-sm">{key.key_value}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          分组：{key.group_name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          过期时间：{key.expires_at === -1 ? '永久' : new Date(key.expires_at * 1000).toLocaleDateString()}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          状态：{key.is_active ? '启用' : '停用'}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(key.key_value);
                            toast({ title: '已复制', description: 'API 密钥已复制到剪贴板' });
                          }}
                        >
                          复制
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setKeyToDelete(key);
                            setIsKeyDeleteDialogOpen(true);
                          }}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="config" className="space-y-4">
            <h2 className="text-xl font-semibold">系统配置</h2>
            <div className="space-y-4">
              {configs.map((config) => (
                <Card key={config.id}>
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <Label htmlFor={config.key}>{CONFIG_I18N[config.key]?.label ?? config.key}</Label>
                      <div className="flex flex-col gap-2 md:flex-row md:items-center">
                        <Input
                          id={config.key}
                          value={config.value}
                          onChange={(e) => {
                            setConfigs(configs.map(c => 
                              c.id === config.id ? { ...c, value: e.target.value } : c
                            ));
                          }}
                          placeholder={CONFIG_I18N[config.key]?.placeholder ?? config.description ?? ''}
                          className="md:flex-1"
                        />
                        <div className="flex flex-wrap gap-2">
                          {config.key === 'model_ids' && (
                            <>
                              <select
                                className={`${baseSelectClasses} min-w-[200px]`}
                                value={modelFetchEndpointId}
                                onChange={(e) => setModelFetchEndpointId(e.target.value)}
                              >
                                <option value="">选择 API 端点</option>
                                {endpoints.map((endpoint) => (
                                  <option key={endpoint.id} value={endpoint.id}>
                                    {endpoint.url}
                                  </option>
                                ))}
                              </select>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={!modelFetchEndpointId || isFetchingModelIds}
                                onClick={handleFetchModelIds}
                              >
                                {isFetchingModelIds ? '获取中...' : '读取模型'}
                              </Button>
                            </>
                          )}
                          <Button
                            onClick={() => updateConfig(config.key, config.value)}
                          >
                            更新
                          </Button>
                        </div>
                      </div>
                      {config.key === 'model_ids' && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          使用“读取模型”后仍需点击“更新”按钮保存到配置。
                        </p>
                      )}
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {CONFIG_I18N[config.key]?.description ?? config.description ?? ''}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <h2 className="text-xl font-semibold">请求日志</h2>
            <Card>
              <CardHeader>
                <CardTitle>实时请求日志</CardTitle>
              </CardHeader>
              <CardContent className="pt-2 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleRefreshLogs} disabled={isLoadingLogs}>
                    {isLoadingLogs ? '刷新中...' : '刷新'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadLogs} disabled={isDownloadingLogs}>
                    {isDownloadingLogs ? '下载中...' : '下载全部'}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleClearLogs} disabled={isClearingLogs}>
                    {isClearingLogs ? '清空中...' : '清空日志'}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  默认显示最新 200 行，包含平台 API、端点 URL/KEY、分组及耗时。
                </p>
                <div className="max-h-[28rem] overflow-auto rounded-md border border-gray-200 bg-black text-green-400 text-xs font-mono p-3 dark:border-gray-700">
                  {requestLogs.length === 0 ? (
                    <p className="text-gray-400">暂无日志记录</p>
                  ) : (
                    requestLogs.map((entry, index) => (
                      <div key={`${entry.timestamp}-${index}`} className="py-2 border-b border-gray-700/50 last:border-b-0">
                        <div className="flex flex-wrap gap-4 text-xs text-gray-300">
                          <span>{entry.timestamp}</span>
                          <span>状态：{entry.status_code}</span>
                          <span>耗时：{entry.response_time}ms</span>
                        </div>
                        <div className="mt-1 space-y-1 text-xs break-all">
                          <div>平台 API：{entry.platform_api || '未知'}</div>
                          <div>客户端 KEY：{entry.client_api_key}</div>
                          <div>端点 URL：{entry.endpoint_url}</div>
                          <div>端点 KEY：{entry.endpoint_api_key}</div>
                          <div>分组：{entry.endpoint_group || '未分组'}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        {/* Create API Key Dialog */}
          <Dialog open={isKeyDialogOpen} onOpenChange={setIsKeyDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>生成 API 密钥</DialogTitle>
                <DialogDescription>
                  请输入新 API 密钥的分组信息
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="key-group">分组名称</Label>
                <select
                  id="key-group"
                  className={baseSelectClasses}
                  value={keyGroupName}
                  onChange={(e) => setKeyGroupName(e.target.value)}
                  disabled={uniqueGroups.length === 0}
                >
                  {uniqueGroups.length === 0 && <option value="">暂无可用分组</option>}
                  {uniqueGroups.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>
                <div className="space-y-2">
                  <Label htmlFor="key-expires">过期时间（天，-1为永不过期）</Label>
                  <Input
                    id="key-expires"
                    type="number"
                    value={keyExpiresAt}
                    onChange={(e) => setKeyExpiresAt(Number(e.target.value))}
                    placeholder="-1"
                    min="-1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsKeyDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  onClick={handleCreateKey}
                  disabled={isCreatingKey || uniqueGroups.length === 0}
                >
                  {isCreatingKey ? '生成中...' : (uniqueGroups.length === 0 ? '无可用分组' : '确认生成')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Create Endpoint Dialog */}
        <Dialog open={isEndpointDialogOpen} onOpenChange={setIsEndpointDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增 API 端点</DialogTitle>
              <DialogDescription>
                请输入新 API 端点的信息
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="endpoint-url">端点 URL</Label>
                <Input
                  id="endpoint-url"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  list={endpointUrlListId}
                />
                {renderSuggestionButtons(urlSuggestions, setEndpointUrl, 'create-url')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="endpoint-api-key">API Key（可用逗号分隔批量导入）</Label>
                <Input
                  id="endpoint-api-key"
                  value={endpointApiKey}
                  onChange={(e) => setEndpointApiKey(e.target.value)}
                  placeholder="支持输入多个，用英文逗号分隔"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  多个 Key 将按相同 URL 与分组分别创建，可用英文逗号 <code>,</code> 分隔。
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="endpoint-group">分组名称</Label>
                <Input
                  id="endpoint-group"
                  value={endpointGroupName}
                  onChange={(e) => setEndpointGroupName(e.target.value)}
                  placeholder="输入分组名称"
                  list={endpointGroupListId}
                />
                {renderSuggestionButtons(groupSuggestions, setEndpointGroupName, 'create-group')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="endpoint-weight">权重</Label>
                <Input
                  id="endpoint-weight"
                  type="number"
                  value={endpointWeight}
                  onChange={(e) => setEndpointWeight(Number(e.target.value))}
                  placeholder="1"
                  min="1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEndpointDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                onClick={handleCreateEndpoint}
                disabled={isCreatingEndpoint}
              >
                {isCreatingEndpoint ? '创建中...' : '确认创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Endpoint Dialog */}
        <Dialog
          open={isEndpointEditDialogOpen}
          onOpenChange={(open) => {
            setIsEndpointEditDialogOpen(open);
            if (!open) {
              resetEndpointEditState();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>编辑 API 端点</DialogTitle>
              <DialogDescription>更新端点字段信息</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-endpoint-url">端点 URL</Label>
                <Input
                  id="edit-endpoint-url"
                  value={editingEndpointUrl}
                  onChange={(e) => setEditingEndpointUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  list={endpointUrlListId}
                />
                {renderSuggestionButtons(urlSuggestions, setEditingEndpointUrl, 'edit-url')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-endpoint-api-key">API Key</Label>
                <Input
                  id="edit-endpoint-api-key"
                  value={editingEndpointApiKey}
                  onChange={(e) => setEditingEndpointApiKey(e.target.value)}
                  placeholder="输入 API Key"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-endpoint-group">分组名称</Label>
                <Input
                  id="edit-endpoint-group"
                  value={editingEndpointGroupName}
                  onChange={(e) => setEditingEndpointGroupName(e.target.value)}
                  placeholder="输入分组名称"
                  list={endpointGroupListId}
                />
                {renderSuggestionButtons(groupSuggestions, setEditingEndpointGroupName, 'edit-group')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-endpoint-weight">权重</Label>
                <Input
                  id="edit-endpoint-weight"
                  type="number"
                  value={editingEndpointWeight}
                  onChange={(e) => setEditingEndpointWeight(Number(e.target.value))}
                  placeholder="1"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-endpoint-active">状态</Label>
                <select
                  id="edit-endpoint-active"
                  className={baseSelectClasses}
                  value={editingEndpointActive ? 'active' : 'inactive'}
                  onChange={(e) => setEditingEndpointActive(e.target.value === 'active')}
                >
                  <option value="active">启用</option>
                  <option value="inactive">停用</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEndpointEditDialogOpen(false);
                  resetEndpointEditState();
                }}
              >
                取消
              </Button>
              <Button onClick={handleUpdateEndpoint} disabled={isSavingEndpoint}>
                {isSavingEndpoint ? '保存中...' : '确认保存'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Endpoint Dialog */}
        <Dialog
          open={isEndpointDeleteDialogOpen}
          onOpenChange={(open) => {
            setIsEndpointDeleteDialogOpen(open);
            if (!open) {
              setEndpointToDelete(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>删除 API 端点</DialogTitle>
              <DialogDescription>
                此操作不可撤销，将永久删除端点 {endpointToDelete?.url}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEndpointDeleteDialogOpen(false);
                  setEndpointToDelete(null);
                }}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteEndpoint}
                disabled={isDeletingEndpoint}
              >
                {isDeletingEndpoint ? '删除中...' : '确认删除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete API Key Dialog */}
        <Dialog
          open={isKeyDeleteDialogOpen}
          onOpenChange={(open) => {
            setIsKeyDeleteDialogOpen(open);
            if (!open) {
              setKeyToDelete(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>删除 API 密钥</DialogTitle>
              <DialogDescription>
                此操作不可撤销，将永久删除密钥 {keyToDelete?.key_value}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsKeyDeleteDialogOpen(false);
                  setKeyToDelete(null);
                }}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteKey}
                disabled={isDeletingKey}
              >
                {isDeletingKey ? '删除中...' : '确认删除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Password Dialog */}
        <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>修改密码</DialogTitle>
              <DialogDescription>
                请输入当前密码和新密码来修改您的管理员密码
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">当前密码</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">新密码</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">确认新密码</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsPasswordDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                onClick={handleChangePassword}
                disabled={isChangingPassword}
              >
                {isChangingPassword ? '修改中...' : '确认修改'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
