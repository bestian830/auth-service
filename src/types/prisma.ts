// src/types/prisma.ts

/** 只需 familyId 的轻量类型（用于 RT 家族去重/撤销） */
export type RefreshFamilyRow = { familyId: string };

/** 只需 success/attemptAt 的轻量类型（用于登录尝试汇总） */
export type LoginAttemptRow = { success: boolean; attemptAt: Date };