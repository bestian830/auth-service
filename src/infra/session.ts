import cookieSession from 'cookie-session';
import { env } from '../config/env.js';

export const sessionMiddleware = cookieSession({
  name: 'tymoe_sess',
  keys: [env.sessionSecret],
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 1000 * 60 * 60 * 8, // 8h 会话
});