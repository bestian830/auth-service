> 所有类型定义请放置于 types/payment.ts，所有常量配置请放置于 constants/payment.ts。config/payment.ts 文件仅负责提供当前支持的支付提供商与订阅计划映射逻辑，不处理业务规则、数据库操作、价格计算等内容。

```ts
/**
 * 支付提供商计划映射模块
 * 职责：配置多支付平台（如 Stripe、PayPal、Square 等）与平台内统一订阅计划的映射关系。
 * 
 * 输入：平台统一订阅计划 ID（如：basic, pro, enterprise）+ 支付提供商标识（如 stripe）
 * 输出：该提供商下的实际产品ID、价格ID、币种等配置
 * 
 * 执行逻辑：
 * 1. 每个订阅计划仅在启用的支付提供商中配置；
 * 2. 所有支付提供商计划映射关系应放入 constants/payment.ts 中；
 * 3. 提供 getProviderPlanConfig(provider, plan) 方法，供 service 层使用。
 */

import { PAYMENT_PROVIDERS, PROVIDER_PLAN_MAP } from '../constants/payment';
import type { PaymentProvider, SubscriptionPlan, ProviderPlanConfig } from '../types/payment';

/**
 * 获取指定支付平台的计划配置
 * @param provider - 支付平台（如 stripe）
 * @param plan - 平台订阅计划（如 basic, pro）
 * @returns ProviderPlanConfig 对象
 * 执行逻辑：在 PROVIDER_PLAN_MAP 中查找并返回对应配置；未配置则抛出异常。
 */
export const getProviderPlanConfig = (
  provider: PaymentProvider,
  plan: SubscriptionPlan
): ProviderPlanConfig => {
  const providerPlans = PROVIDER_PLAN_MAP[provider];
  if (!providerPlans) {
    throw new Error(`Unsupported payment provider: ${provider}`);
  }

  const planConfig = providerPlans[plan];
  if (!planConfig) {
    throw new Error(`Plan '${plan}' not found for provider '${provider}'`);
  }

  return planConfig;
};

/**
 * 获取某个 provider 所有计划
 * 用于前端展示/订阅选项渲染等
 */
export const getAvailablePlansForProvider = (
  provider: PaymentProvider
): Record<SubscriptionPlan, ProviderPlanConfig> => {
  const plans = PROVIDER_PLAN_MAP[provider];
  if (!plans) {
    throw new Error(`Provider '${provider}' is not configured`);
  }
  return plans;
};
