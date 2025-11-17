import { getActiveApiEndpoints, getSystemConfig, logRequest } from './database/operations';
import type { ApiEndpoint } from './database';

export interface LoadBalancerConfig {
  strategy: 'round_robin' | 'weight_based' | 'time_based';
  switchFrequency: number;
  switchTimeInterval: number;
  enableUrlSwitch: boolean;
  enableKeySwitch: boolean;
}

export interface CurrentEndpoint {
  endpoint: ApiEndpoint;
  requestCount: number;
  lastSwitchTime: number;
  consecutiveFailures: number; // 新增：连续失败次数
}

class LoadBalancer {
  private endpoints: ApiEndpoint[] = [];
  private currentEndpoint: CurrentEndpoint | null = null;
  private currentIndex = 0;
  private config: LoadBalancerConfig;
  private lastUpdateTime = 0;
  private failedEndpoints: Set<string> = new Set(); // 记录失败的端点URL
  private currentGroup: string | null = null; // 当前请求对应的分组
  private maxFailures = 3; // 最大失败次数
  private failureCooldown = 5 * 60 * 1000; // 失败冷却时间（5分钟）

  constructor() {
    this.config = this.loadConfig();
    this.updateEndpoints();
  }

  private loadConfig(): LoadBalancerConfig {
    return {
      strategy: (getSystemConfig('load_balance_strategy') as LoadBalancerConfig['strategy']) || 'round_robin',
      switchFrequency: parseInt(getSystemConfig('switch_frequency') || '10'),
      switchTimeInterval: parseInt(getSystemConfig('switch_time_interval') || '60'),
      enableUrlSwitch: getSystemConfig('enable_url_switch') === 'true',
      enableKeySwitch: getSystemConfig('enable_key_switch') === 'true'
    };
  }

  private updateEndpoints(group?: string | null): void {
    // 获取所有活跃端点并按分组过滤
    const allEndpoints = getActiveApiEndpoints();
    const filteredByGroup = group ? allEndpoints.filter(endpoint => endpoint.group_name === group) : allEndpoints;
    
    // 过滤掉当前被标记为失败的端点
    this.endpoints = filteredByGroup.filter(endpoint => !this.failedEndpoints.has(endpoint.url));
    this.currentIndex = 0; // 每次刷新列表重置轮询索引
    
    // 如果过滤后没有可用端点，重置失败列表并使用分组内所有端点
    if (this.endpoints.length === 0 && filteredByGroup.length > 0) {
      this.failedEndpoints.clear();
      this.endpoints = filteredByGroup;
    }
    
    this.lastUpdateTime = Date.now();
  }

  private shouldSwitchEndpoint(): boolean {
    if (!this.currentEndpoint) return true;

    const now = Date.now();
    const timeSinceLastSwitch = now - this.currentEndpoint.lastSwitchTime;
    const timeBasedSwitch = timeSinceLastSwitch >= this.config.switchTimeInterval * 1000;
    const requestBasedSwitch = this.currentEndpoint.requestCount >= this.config.switchFrequency;

    return timeBasedSwitch || requestBasedSwitch;
  }

  private selectNextEndpoint(): ApiEndpoint {
    if (this.endpoints.length === 0) {
      throw new Error('No active API endpoints available');
    }

    let selectedEndpoint: ApiEndpoint;

    switch (this.config.strategy) {
      case 'weight_based':
        selectedEndpoint = this.selectByWeight();
        break;
      case 'time_based':
        selectedEndpoint = this.selectByTime();
        break;
      case 'round_robin':
      default:
        selectedEndpoint = this.selectByRoundRobin();
        break;
    }

    return selectedEndpoint;
  }

  private selectByRoundRobin(): ApiEndpoint {
    const endpoint = this.endpoints[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
    return endpoint;
  }

  private selectByWeight(): ApiEndpoint {
    const totalWeight = this.endpoints.reduce((sum, ep) => sum + ep.weight, 0);
    let randomWeight = Math.random() * totalWeight;

    for (const endpoint of this.endpoints) {
      randomWeight -= endpoint.weight;
      if (randomWeight <= 0) {
        return endpoint;
      }
    }

    return this.endpoints[0]; // Fallback
  }

  private selectByTime(): ApiEndpoint {
    const now = Date.now();
    const timeSlots = this.endpoints.length;
    const timeSlot = Math.floor((now / 1000) / this.config.switchTimeInterval) % timeSlots;
    return this.endpoints[timeSlot] || this.endpoints[0];
  }

  public getNextEndpoint(group?: string): CurrentEndpoint {
    // 当分组变化时，重置当前端点并刷新列表
    if (this.currentGroup !== (group || null)) {
      this.currentGroup = group || null;
      this.currentEndpoint = null;
      this.updateEndpoints(this.currentGroup);
    }

    // Update endpoints if cache is stale (older than 5 minutes)
    if (Date.now() - this.lastUpdateTime > 5 * 60 * 1000) {
      this.updateEndpoints(this.currentGroup);
    }

    // 如果没有可用的端点，抛出错误
    if (this.endpoints.length === 0) {
      throw new Error('No active API endpoints available');
    }

    // Check if we need to switch endpoints
    if (this.shouldSwitchEndpoint()) {
      try {
        const newEndpoint = this.selectNextEndpoint();
        this.currentEndpoint = {
          endpoint: newEndpoint,
          requestCount: 0,
          lastSwitchTime: Date.now(),
          consecutiveFailures: 0 // 重置失败计数
        };
      } catch (error) {
        // 如果选择端点失败，尝试使用当前端点
        if (!this.currentEndpoint) {
          throw new Error('Unable to select API endpoint');
        }
      }
    }

    if (!this.currentEndpoint) {
      throw new Error('Unable to select API endpoint');
    }

    // Increment request count
    this.currentEndpoint.requestCount++;
    return this.currentEndpoint;
  }

    // 新增：标记端点失败
  public markEndpointFailure(endpointUrl: string): void {
    // 增加当前端点的失败计数
    if (this.currentEndpoint && this.currentEndpoint.endpoint.url === endpointUrl) {
      this.currentEndpoint.consecutiveFailures++;
      
      // 如果连续失败次数超过阈值，将端点标记为失败
      if (this.currentEndpoint.consecutiveFailures >= this.maxFailures) {
        this.failedEndpoints.add(endpointUrl);
        
        // 设置一个定时器，在冷却时间后重置失败状态
        setTimeout(() => {
          this.failedEndpoints.delete(endpointUrl);
          this.updateEndpoints(this.currentGroup);
        }, this.failureCooldown);
        
        // 强制更新端点列表，排除失败的端点
        this.updateEndpoints(this.currentGroup);
        
        // 重置当前端点，强制选择新端点
        this.currentEndpoint = null;
      }
    }
  }

  // 新增：标记端点成功
  public markEndpointSuccess(endpointUrl: string): void {
    // 如果是当前端点，重置失败计数
    if (this.currentEndpoint && this.currentEndpoint.endpoint.url === endpointUrl) {
      this.currentEndpoint.consecutiveFailures = 0;
    }
    
    // 如果端点之前被标记为失败，现在恢复它
    if (this.failedEndpoints.has(endpointUrl)) {
      this.failedEndpoints.delete(endpointUrl);
      this.updateEndpoints(this.currentGroup);
    }
  }

  public getCurrentEndpoint(): CurrentEndpoint | null {
    return this.currentEndpoint;
  }

  public getAllEndpoints(): ApiEndpoint[] {
    return [...this.endpoints];
  }

  public refreshConfig(): void {
    this.config = this.loadConfig();
    this.updateEndpoints(this.currentGroup);
  }

  public logApiRequest(apiKey: string, statusCode: number, responseTime: number, platformApi: string): void {
    if (this.currentEndpoint) {
      const { endpoint } = this.currentEndpoint;
      logRequest(
        apiKey,
        endpoint.url,
        endpoint.api_key,
        endpoint.group_name,
        platformApi,
        statusCode,
        responseTime
      );
    }
  }
}

// Singleton instance
let loadBalancerInstance: LoadBalancer | null = null;

export function getLoadBalancer(): LoadBalancer {
  if (!loadBalancerInstance) {
    loadBalancerInstance = new LoadBalancer();
  }
  return loadBalancerInstance;
}

export function refreshLoadBalancer(): void {
  if (loadBalancerInstance) {
    loadBalancerInstance.refreshConfig();
  }
}

// Helper function to get endpoint info for API responses
export function getEndpointInfo(endpoint: ApiEndpoint) {
  return {
    url: endpoint.url,
    group: endpoint.group_name,
    weight: endpoint.weight,
    isActive: endpoint.is_active
  };
}
