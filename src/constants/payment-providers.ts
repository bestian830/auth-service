/**
 * 支付服务商枚举
 * 与 schema.prisma 中的 PaymentProvider 保持同步
 */
export const PAYMENT_PROVIDERS = {
  STRIPE: 'stripe',
  PAYPAL: 'paypal',
  SQUARE: 'square',
  WECHAT: 'wechat',
  ALIPAY: 'alipay',
  UNIONPAY: 'unionpay'
} as const;

/**
 * 支付服务商显示名称
 */
export const PAYMENT_PROVIDER_LABELS = {
  [PAYMENT_PROVIDERS.STRIPE]: 'Stripe',
  [PAYMENT_PROVIDERS.PAYPAL]: 'PayPal',
  [PAYMENT_PROVIDERS.SQUARE]: 'Square',
  [PAYMENT_PROVIDERS.WECHAT]: 'WeChat Pay',
  [PAYMENT_PROVIDERS.ALIPAY]: 'Alipay',
  [PAYMENT_PROVIDERS.UNIONPAY]: 'UnionPay'
} as const;

/**
 * 支付服务商支持的货币
 */
export const PROVIDER_CURRENCIES = {
  [PAYMENT_PROVIDERS.STRIPE]: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'HKD', 'SGD'],
  [PAYMENT_PROVIDERS.PAYPAL]: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
  [PAYMENT_PROVIDERS.SQUARE]: ['USD', 'CAD', 'GBP', 'EUR', 'AUD'],
  [PAYMENT_PROVIDERS.WECHAT]: ['CNY'],
  [PAYMENT_PROVIDERS.ALIPAY]: ['CNY', 'USD', 'EUR', 'GBP', 'HKD'],
  [PAYMENT_PROVIDERS.UNIONPAY]: ['CNY', 'USD', 'EUR', 'GBP', 'HKD', 'JPY']
} as const;

/**
 * 支付服务商支持的功能
 */
export const PROVIDER_FEATURES = {
  [PAYMENT_PROVIDERS.STRIPE]: {
    subscriptions: true,
    oneTimePayments: true,
    refunds: true,
    webhooks: true,
    savedPaymentMethods: true,
    multiCurrency: true,
    fraudDetection: true,
    disputeManagement: true
  },
  [PAYMENT_PROVIDERS.PAYPAL]: {
    subscriptions: true,
    oneTimePayments: true,
    refunds: true,
    webhooks: true,
    savedPaymentMethods: true,
    multiCurrency: true,
    fraudDetection: true,
    disputeManagement: true
  },
  [PAYMENT_PROVIDERS.SQUARE]: {
    subscriptions: true,
    oneTimePayments: true,
    refunds: true,
    webhooks: true,
    savedPaymentMethods: true,
    multiCurrency: false,
    fraudDetection: true,
    disputeManagement: true
  },
  [PAYMENT_PROVIDERS.WECHAT]: {
    subscriptions: false,
    oneTimePayments: true,
    refunds: true,
    webhooks: true,
    savedPaymentMethods: false,
    multiCurrency: false,
    fraudDetection: false,
    disputeManagement: false
  },
  [PAYMENT_PROVIDERS.ALIPAY]: {
    subscriptions: false,
    oneTimePayments: true,
    refunds: true,
    webhooks: true,
    savedPaymentMethods: false,
    multiCurrency: true,
    fraudDetection: false,
    disputeManagement: false
  },
  [PAYMENT_PROVIDERS.UNIONPAY]: {
    subscriptions: true,
    oneTimePayments: true,
    refunds: true,
    webhooks: false,
    savedPaymentMethods: true,
    multiCurrency: true,
    fraudDetection: false,
    disputeManagement: false
  }
} as const;

/**
 * 支付服务商地区支持
 */
export const PROVIDER_REGIONS = {
  [PAYMENT_PROVIDERS.STRIPE]: ['US', 'EU', 'UK', 'CA', 'AU', 'JP', 'SG', 'HK'],
  [PAYMENT_PROVIDERS.PAYPAL]: ['US', 'EU', 'UK', 'CA', 'AU', 'JP'],
  [PAYMENT_PROVIDERS.SQUARE]: ['US', 'CA', 'UK', 'AU'],
  [PAYMENT_PROVIDERS.WECHAT]: ['CN', 'HK', 'TW'],
  [PAYMENT_PROVIDERS.ALIPAY]: ['CN', 'HK', 'TW', 'SG', 'MY'],
  [PAYMENT_PROVIDERS.UNIONPAY]: ['CN', 'HK', 'TW', 'SG', 'MY', 'TH', 'KR', 'JP']
} as const;

/**
 * 国际支付服务商
 */
export const INTERNATIONAL_PROVIDERS = [
  PAYMENT_PROVIDERS.STRIPE,
  PAYMENT_PROVIDERS.PAYPAL,
  PAYMENT_PROVIDERS.SQUARE
] as const;

/**
 * 中国支付服务商
 */
export const CHINESE_PROVIDERS = [
  PAYMENT_PROVIDERS.WECHAT,
  PAYMENT_PROVIDERS.ALIPAY,
  PAYMENT_PROVIDERS.UNIONPAY
] as const;

/**
 * 支持订阅的支付服务商
 */
export const SUBSCRIPTION_CAPABLE_PROVIDERS = [
  PAYMENT_PROVIDERS.STRIPE,
  PAYMENT_PROVIDERS.PAYPAL,
  PAYMENT_PROVIDERS.SQUARE,
  PAYMENT_PROVIDERS.UNIONPAY
] as const;

/**
 * 默认支付服务商（按地区）
 */
export const DEFAULT_PROVIDERS_BY_REGION = {
  US: PAYMENT_PROVIDERS.STRIPE,
  EU: PAYMENT_PROVIDERS.STRIPE,
  UK: PAYMENT_PROVIDERS.STRIPE,
  CA: PAYMENT_PROVIDERS.STRIPE,
  AU: PAYMENT_PROVIDERS.STRIPE,
  CN: PAYMENT_PROVIDERS.ALIPAY,
  HK: PAYMENT_PROVIDERS.STRIPE,
  SG: PAYMENT_PROVIDERS.STRIPE,
  JP: PAYMENT_PROVIDERS.STRIPE
} as const; 