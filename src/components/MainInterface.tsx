import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface SystemInfo {
  server_url: string;
  model_ids: string[];
  purchase_url?: string;
  purchase_button_label?: string;
}

const DEFAULT_PURCHASE_URL = 'https://qm.qq.com/q/a76O4CjZAI';
const DEFAULT_PURCHASE_LABEL = '立即获取！';

interface ApiKeyInfo {
  key_value: string;
  group_name: string;
  expires_at: number;
  is_active: boolean;
  is_valid: boolean;
  created_at: string;
}

export function MainInterface() {
  const [apiKey, setApiKey] = useState('');
  const [keyInfo, setKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fetch system info on component mount
  useEffect(() => {
    fetchSystemInfo();
  }, []);

  const fetchSystemInfo = async () => {
    try {
      const response = await fetch('/api/keys/info');
      if (response.ok) {
        const data = await response.json();
        setSystemInfo(data);
      }
    } catch (error) {
      console.error('Failed to fetch system info:', error);
    }
  };

  const queryApiKey = async () => {
    if (!apiKey.trim()) {
      toast({
        title: '错误',
        description: '请输入 API Key',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/keys/query/${apiKey}`);
      const data = await response.json();

      if (response.ok) {
        setKeyInfo(data);
        toast({
          title: '成功',
          description: '已获取 API Key 信息',
        });
      } else {
        throw new Error(data.error || 'Failed to query API key');
      }
    } catch (error) {
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '查询 API Key 失败',
        variant: 'destructive',
      });
      setKeyInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const openPurchaseLink = () => {
    const targetUrl = systemInfo?.purchase_url || DEFAULT_PURCHASE_URL;
    window.open(targetUrl, '_blank');
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: '成功',
        description: `${type}已复制到剪贴板`,
      });
    }).catch(err => {
      console.error('复制失败:', err);
      toast({
        title: '错误',
        description: '复制失败',
        variant: 'destructive',
      });
    });
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4 text-gray-900">万能 API 代理服务</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">智能负载均衡与密钥管理的专业 API 代理服务</p>
        </div>

        {/* Server Info */}
        {systemInfo && (
          <div className="mb-12">
            <Card>
              <CardHeader>
                <CardTitle>服务器信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>API 服务地址</Label>
                  <div 
                    className="mt-1 p-3 bg-gray-100 rounded-lg font-mono text-sm break-all cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => copyToClipboard(systemInfo.server_url, 'API服务地址')}
                    title="点击复制"
                  >
                    {systemInfo.server_url}
                  </div>
                </div>
                <div>
                  <Label>可用模型</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {systemInfo.model_ids.map((model) => (
                      <span
                        key={model}
                        className="px-3 py-1 bg-black text-white rounded-full text-sm cursor-pointer hover:bg-gray-800 transition-colors"
                        onClick={() => copyToClipboard(model, '模型名称')}
                        title="点击复制"
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* API 密钥查询与购买 */}
        <div className="mb-12 grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>API 密钥查询</CardTitle>
              <CardDescription className="text-gray-600">
                查询你的 API 密钥状态与所属分组
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="apiKey" className="text-gray-900">API 密钥</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="apiKey"
                    type="text"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                  />
                  <Button
                    onClick={queryApiKey}
                    disabled={loading}
                    className="bg-black hover:bg-gray-800"
                  >
                    {loading ? '查询中...' : '查询'}
                  </Button>
                </div>
              </div>

              {keyInfo && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">状态:</span>
                      <span className={`ml-2 px-2 py-1 rounded text-white ${keyInfo.is_valid ? 'bg-green-600' : 'bg-red-600'}`}>
                        {keyInfo.is_valid ? '有效' : '无效'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">分组:</span>
                      <span className="ml-2 text-gray-900">{keyInfo.group_name}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">过期时间:</span>
                      <span className="ml-2 text-gray-900">
                        {keyInfo.expires_at === -1 ? '永久' : new Date(keyInfo.expires_at * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">是否激活：</span>
                      <span className="ml-2 text-gray-900">{keyInfo.is_active ? '是' : '否'}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>需要 API Key ？</CardTitle>
              <CardDescription>联系我们来购买 API Key</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-end">
              <Button
                onClick={openPurchaseLink}
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
              >
                {systemInfo?.purchase_button_label || DEFAULT_PURCHASE_LABEL}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Features */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">负载均衡</h3>
            <p className="text-gray-400">
              在多个 API 端点之间智能分发请求
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">安全可靠</h3>
            <p className="text-gray-400">
              企业级安全：API 密钥管理与请求日志
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">便捷管理</h3>
            <p className="text-gray-400">
              简洁的后台界面，用于管理端点、密钥与配置
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
