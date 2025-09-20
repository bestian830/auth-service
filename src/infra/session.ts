import cookieSession from 'cookie-session';
import { env } from '../config/env.js';

export const sessionMiddleware = cookieSession({
  name: 'tymoe_sess',
  keys: [env.sessionSecret],
  httpOnly: true,
  sameSite: env.cookieSameSite as 'lax' | 'none' | 'strict',
  secure: env.nodeEnv === 'production',
  maxAge: 1000 * 60 * 60 * 8, // 8h 会话
});