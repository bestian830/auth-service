import { randomUUID, createHash } from 'crypto';
import { prisma } from '../infra/prisma.js';

function toBase64Url(b64: string) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function sha256b64u(input: string): string {
  const digest = createHash('sha256').update(input).digest('base64');
  return toBase64Url(digest);
}

export async function createAuthorizationCode(params: {
  userId: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  codeChallenge: string;      // from client (S256)
  ttlSeconds?: number;        // default 300s
}) {
  const id = randomUUID();
  const ttl = (params.ttlSeconds ?? 300) * 1000;
  await prisma.authorizationCode.create({
    data: {
      id,
      subjectUserId: params.userId,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scope: params.scope ?? '',
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: 'S256',
      expiresAt: new Date(Date.now() + ttl),
      used: false,
    },
  });
  return { code: id };
}

export async function consumeAuthorizationCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const rec = await prisma.authorizationCode.findUnique({ where: { id: params.code } });
  if (!rec || rec.used || rec.expiresAt < new Date()) {
    throw new Error('invalid_grant');
  }
  if (rec.clientId !== params.clientId || rec.redirectUri !== params.redirectUri) {
    throw new Error('invalid_grant');
  }
  // PKCE: S256(verifier) == code_challenge
  const challenge = sha256b64u(params.codeVerifier);
  if (challenge !== rec.codeChallenge) {
    throw new Error('pkce_mismatch');
  }
  await prisma.authorizationCode.update({
    where: { id: rec.id },
    data: { used: true, usedAt: new Date() },
  });
  return { userId: rec.subjectUserId!, clientId: rec.clientId, scope: rec.scope ?? '' };
}