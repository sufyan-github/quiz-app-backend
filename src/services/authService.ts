import jwt from 'jsonwebtoken';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { prisma } from '../prisma';
import { JWT_SECRET } from '../config/jwt';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
}

let firebaseInitializationAttempted = false;

function ensureFirebaseAdmin(): void {
  if (firebaseInitializationAttempted) return;
  firebaseInitializationAttempted = true;

  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault() });
  }
}

function normalizeMobile(value?: string): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length === 13) return digits.slice(3);
  if (digits.startsWith('0') && digits.length === 11) return digits;
  return null;
}

async function resolveCustomJwt(token: string): Promise<AuthenticatedUser | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'quiz-ai-api',
      audience: 'quiz-ai-clients',
    }) as jwt.JwtPayload;

    if (typeof decoded.userId !== 'string') return null;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, deletedAt: true },
    });
    return user && !user.deletedAt ? { userId: user.id, email: user.email, role: user.role } : null;
  } catch {
    return null;
  }
}

async function resolveFirebaseToken(token: string): Promise<AuthenticatedUser | null> {
  try {
    ensureFirebaseAdmin();
    const decoded = await getAuth().verifyIdToken(token, true);
    const email = decoded.email?.trim().toLowerCase();
    const mobile = normalizeMobile(decoded.phone_number);

    if (!mobile && (!email || decoded.email_verified !== true)) return null;

    let user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true, email: true, role: true, firebaseUid: true, deletedAt: true },
    });

    // A deleted identity must never be recreated from the same Firebase token.
    if (user?.deletedAt) return null;

    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          deletedAt: null,
          OR: [
            ...(mobile ? [{ mobile }] : []),
            ...(email ? [{ email }] : []),
          ],
        },
        select: { id: true, email: true, role: true, firebaseUid: true, deletedAt: true },
      });
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: email ?? `firebase-${decoded.uid}@users.quizai.local`,
          firebaseUid: decoded.uid,
          mobile,
          role: 'STUDENT',
          profile: { create: { name: decoded.name?.trim() || 'Quiz AI Student' } },
        },
        select: { id: true, email: true, role: true, firebaseUid: true, deletedAt: true },
      });
    } else if (!user.firebaseUid) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { firebaseUid: decoded.uid },
        select: { id: true, email: true, role: true, firebaseUid: true, deletedAt: true },
      });
    }

    return { userId: user.id, email: user.email, role: user.role };
  } catch {
    return null;
  }
}

/** Resolve either a Quiz AI access token or a Firebase ID token to one DB user. */
export async function resolveAuthToken(token: string): Promise<AuthenticatedUser | null> {
  return (await resolveCustomJwt(token)) ?? resolveFirebaseToken(token);
}

export function issueAccessToken(user: { id: string; role: string }): string {
  return jwt.sign(
    { userId: user.id },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '2h',
      issuer: 'quiz-ai-api',
      audience: 'quiz-ai-clients',
      subject: user.id,
    },
  );
}
