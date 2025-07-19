/**
 * 支付相关常量配置
 */

import { PAYMENT_PROVIDERS } from './payment-providers';
import type { PaymentProvider, SubscriptionPlan } from '../types/common';
import type { ProviderPlanConfig } from '../types/payment';

/**
 * 支付提供商与订阅计划映射关系
 * 配置每个订阅计划在各支付提供商中的具体配置信息
 */
export const PROVIDER_PLAN_MAP: Record<PaymentProvider, Partial<Record<SubscriptionPlan, ProviderPlanConfig>>> = {
  // Stripe 支付提供商配置
  stripe: {
    BASIC: {
      productId: 'prod_basic_stripe',
      monthlyPriceId: 'price_basic_monthly_stripe',
      yearlyPriceId: 'price_basic_yearly_stripe',
      currency: 'usd',
      monthlyAmount: 2900, // $29.00
      yearlyAmount: 29000, // $290.00 (约17%折扣)
      trialDays: 14,
      metadata: {
        features: ['basic_bookings', 'basic_analytics'],
        limits: { max_bookings: 100, max_staff: 5 }
      }
    },
    STANDARD: {
      productId: 'prod_standard_stripe',
      monthlyPriceId: 'price_standard_monthly_stripe',
      yearlyPriceId: 'price_standard_yearly_stripe',
      currency: 'usd',
      monthlyAmount: 5900, // $59.00
      yearlyAmount: 59000, // $590.00 (约17%折扣)
      trialDays: 14,
      metadata: {
        features: ['advanced_bookings', 'advanced_analytics', 'integrations'],
        limits: { max_bookings: 500, max_staff: 20 }
      }
    },
    PREMIUM: {
      productId: 'prod_premium_stripe',
      monthlyPriceId: 'price_premium_monthly_stripe',
      yearlyPriceId: 'price_premium_yearly_stripe',
      currency: 'usd',
      monthlyAmount: 9900, // $99.00
      yearlyAmount: 99000, // $990.00 (约17%折扣)
      trialDays: 30,
      metadata: {
        features: ['unlimited_bookings', 'premium_analytics', 'api_access', 'priority_support'],
        limits: { max_bookings: -1, max_staff: -1 } // -1 表示无限制
      }
    }
  },

  // PayPal 支付提供商配置
  paypal: {
    BASIC: {
      productId: 'BASIC-PLAN-PAYPAL',
      monthlyPriceId: 'P-BASIC-MONTHLY-PAYPAL',
      yearlyPriceId: 'P-BASIC-YEARLY-PAYPAL',
      currency: 'usd',
      monthlyAmount: 2900,
      yearlyAmount: 29000,
      trialDays: 14
    },
    STANDARD: {
      productId: 'STANDARD-PLAN-PAYPAL',
      monthlyPriceId: 'P-STANDARD-MONTHLY-PAYPAL',
      yearlyPriceId: 'P-STANDARD-YEARLY-PAYPAL',
      currency: 'usd',
      monthlyAmount: 5900,
      yearlyAmount: 59000,
      trialDays: 14
    },
    PREMIUM: {
      productId: 'PREMIUM-PLAN-PAYPAL',
      monthlyPriceId: 'P-PREMIUM-MONTHLY-PAYPAL',
      yearlyPriceId: 'P-PREMIUM-YEARLY-PAYPAL',
      currency: 'usd',
      monthlyAmount: 9900,
      yearlyAmount: 99000,
      trialDays: 30
    }
  },

  // Square 支付提供商配置
  square: {
    BASIC: {
      productId: 'basic-plan-square',
      monthlyPriceId: 'basic-monthly-square',
      yearlyPriceId: 'basic-yearly-square',
      currency: 'usd',
      monthlyAmount: 2900,
      yearlyAmount: 29000,
      trialDays: 14
    },
    STANDARD: {
      productId: 'standard-plan-square',
      monthlyPriceId: 'standard-monthly-square',
      yearlyPriceId: 'standard-yearly-square',
      currency: 'usd',
      monthlyAmount: 5900,
      yearlyAmount: 59000,
      trialDays: 14
    }
    // Square 暂不支持 PREMIUM 计划
  },

  // 微信支付配置（中国市场）
  wechat: {
    BASIC: {
      productId: 'basic-plan-wechat',
      monthlyPriceId: 'basic-monthly-wechat',
      yearlyPriceId: 'basic-yearly-wechat',
      currency: 'cny',
      monthlyAmount: 19900, // ¥199.00
      yearlyAmount: 199000, // ¥1990.00
      trialDays: 7 // 微信支付试用期较短
    },
    STANDARD: {
      productId: 'standard-plan-wechat',
      monthlyPriceId: 'standard-monthly-wechat',
      yearlyPriceId: 'standard-yearly-wechat',
      currency: 'cny',
      monthlyAmount: 39900, // ¥399.00
      yearlyAmount: 399000, // ¥3990.00
      trialDays: 7
    }
    // 微信支付暂不支持 PREMIUM 计划
  },

  // 支付宝配置（中国市场）
  alipay: {
    BASIC: {
      productId: 'basic-plan-alipay',
      monthlyPriceId: 'basic-monthly-alipay',
      yearlyPriceId: 'basic-yearly-alipay',
      currency: 'cny',
      monthlyAmount: 19900,
      yearlyAmount: 199000,
      trialDays: 7
    },
    STANDARD: {
      productId: 'standard-plan-alipay',
      monthlyPriceId: 'standard-monthly-alipay',
      yearlyPriceId: 'standard-yearly-alipay',
      currency: 'cny',
      monthlyAmount: 39900,
      yearlyAmount: 399000,
      trialDays: 7
    }
    // 支付宝暂不支持 PREMIUM 计划
  },

  // 银联配置
  unionpay: {
    BASIC: {
      productId: 'basic-plan-unionpay',
      monthlyPriceId: 'basic-monthly-unionpay',
      yearlyPriceId: 'basic-yearly-unionpay',
      currency: 'cny',
      monthlyAmount: 19900,
      yearlyAmount: 199000,
      trialDays: 7
    }
    // 银联目前只支持基础计划
  }
};

/**
 * 默认启用的支付提供商
 */
export const ENABLED_PROVIDERS: PaymentProvider[] = [
  PAYMENT_PROVIDERS.STRIPE,
  PAYMENT_PROVIDERS.PAYPAL
];

/**
 * 各地区推荐的支付提供商
 */
export const REGIONAL_PROVIDERS = {
  US: [PAYMENT_PROVIDERS.STRIPE, PAYMENT_PROVIDERS.PAYPAL, PAYMENT_PROVIDERS.SQUARE],
  EU: [PAYMENT_PROVIDERS.STRIPE, PAYMENT_PROVIDERS.PAYPAL],
  CN: [PAYMENT_PROVIDERS.WECHAT, PAYMENT_PROVIDERS.ALIPAY, PAYMENT_PROVIDERS.UNIONPAY],
  GLOBAL: [PAYMENT_PROVIDERS.STRIPE, PAYMENT_PROVIDERS.PAYPAL]
} as const; 