import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

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

interface AdminDashboardProps {
  token: string;
  onLogout: () => void;
}

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
  
  // API Key dialog states
  const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);
  const [keyGroupName, setKeyGroupName] = useState('');
  const [keyExpiresAt, setKeyExpiresAt] = useState(-1);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  
  const { toast } = useToast();

  const CONFIG_I18N: Record<string, { label: string; placeholder: string; description: string }> = {
    load_balance_strategy: {
      label: '负载均衡策略',
      placeholder: 'round_robin | weight_based | time_based',
      description: '从 round_robin、weight_based、time_based 中选择'
    },
    switch_frequency: {
      label: '切换频率（请求数）',
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
    }
  };

  // Fetch data
  const fetchData = async () => {
    try {
      const [endpointsRes, keysRes, configsRes, statsRes] = await Promise.all([
        fetch('/api/admin/endpoints', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/admin/keys', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/admin/config', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/admin/stats', { headers: { 'Authorization': `Bearer ${token}` } })
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
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // Create endpoint
  const createEndpoint = async (endpointData: Omit<ApiEndpoint, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const response = await fetch('/api/admin/endpoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(endpointData)
      });

      if (!response.ok) throw new Error('创建端点失败');

      const newEndpoint = await response.json();
      setEndpoints([newEndpoint, ...endpoints]);
      toast({ title: '成功', description: '端点创建成功' });
    } catch (error) {
      console.error(error);
      toast({
        title: '错误',
        description: '创建端点失败',
        variant: 'destructive',
      });
    }
  };

  // Create API key
  const createApiKey = async (keyData: Omit<ApiKey, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const response = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(keyData)
      });

      if (!response.ok) throw new Error('创建密钥失败');

      const newKey = await response.json();
      setKeys([newKey, ...keys]);
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

  // Update config
  const updateConfig = async (key: string, value: string) => {
    try {
      const response = await fetch(`/api/admin/config/${key}`, {
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
    if (!endpointUrl || !endpointApiKey || !endpointGroupName) {
      toast({
        title: '错误',
        description: '请填写所有必填字段',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingEndpoint(true);
    try {
      await createEndpoint({
        url: endpointUrl,
        api_key: endpointApiKey,
        group_name: endpointGroupName,
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

  // Handle create API key
  const handleCreateKey = async () => {
    if (!keyGroupName) {
      toast({
        title: '错误',
        description: '请填写分组名称',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingKey(true);
    try {
      await createApiKey({
        key_value: '', // Will be generated server-side
        group_name: keyGroupName,
        expires_at: keyExpiresAt,
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
          </TabsList>

          <TabsContent value="endpoints" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">API 端点</h2>
              <Button onClick={() => setIsEndpointDialogOpen(true)}>
                新增端点
              </Button>
            </div>
            <div className="grid gap-4">
              {endpoints.map((endpoint) => (
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
                          onClick={() => {
                            const newUrl = prompt('输入新的 URL：', endpoint.url);
                            const newApiKey = prompt('输入新的 API Key：', endpoint.api_key);
                            const newGroup = prompt('输入新的 分组：', endpoint.group_name);
                            if (newUrl && newApiKey && newGroup) {
                              // Update logic here
                            }
                          }}
                        >
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm('确定要删除该端点吗？')) {
                              // Delete logic here
                            }
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
                            if (confirm('确定要删除该密钥吗？')) {
                              // Delete logic here
                            }
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
            <div className="grid gap-4">
              {configs.map((config) => (
                <Card key={config.id}>
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <Label htmlFor={config.key}>{CONFIG_I18N[config.key]?.label ?? config.key}</Label>
                      <div className="flex space-x-2">
                        <Input
                          id={config.key}
                          value={config.value}
                          onChange={(e) => {
                            setConfigs(configs.map(c => 
                              c.id === config.id ? { ...c, value: e.target.value } : c
                            ));
                          }}
                          placeholder={CONFIG_I18N[config.key]?.placeholder ?? config.description ?? ''}
                        />
                        <Button
                          onClick={() => updateConfig(config.key, config.value)}
                        >
                          更新
                        </Button>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {CONFIG_I18N[config.key]?.description ?? config.description ?? ''}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
                  <Input
                    id="key-group"
                    value={keyGroupName}
                    onChange={(e) => setKeyGroupName(e.target.value)}
                    placeholder="输入分组名称"
                  />
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
                  disabled={isCreatingKey}
                >
                  {isCreatingKey ? '生成中...' : '确认生成'}
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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endpoint-api-key">API Key</Label>
                <Input
                  id="endpoint-api-key"
                  value={endpointApiKey}
                  onChange={(e) => setEndpointApiKey(e.target.value)}
                  placeholder="输入 API Key"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endpoint-group">分组名称</Label>
                <Input
                  id="endpoint-group"
                  value={endpointGroupName}
                  onChange={(e) => setEndpointGroupName(e.target.value)}
                  placeholder="输入分组名称"
                />
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