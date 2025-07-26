// types/subscription_types.ts

export type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELED' | 'UNSUBSCRIBE';
export type SubscriptionPlan = 'BASIC' | 'STANDARD' | 'PRO' | 'PREMIUM';

export interface SubscriptionInfo {
  tenantId: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  expiresAt?: string;
  trialEndAt?: string;
} 