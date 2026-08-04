"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAuthToken = resolveAuthToken;
exports.issueAccessToken = issueAccessToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const prisma_1 = require("../prisma");
const jwt_1 = require("../config/jwt");
let firebaseInitializationAttempted = false;
function ensureFirebaseAdmin() {
    if (firebaseInitializationAttempted)
        return;
    firebaseInitializationAttempted = true;
    if ((0, app_1.getApps)().length === 0) {
        (0, app_1.initializeApp)({ credential: (0, app_1.applicationDefault)() });
    }
}
function normalizeMobile(value) {
    if (!value)
        return null;
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith('880') && digits.length === 13)
        return digits.slice(3);
    if (digits.startsWith('0') && digits.length === 11)
        return digits;
    return null;
}
async function resolveCustomJwt(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, jwt_1.JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'quiz-ai-api',
            audience: 'quiz-ai-clients',
        });
        if (typeof decoded.userId !== 'string')
            return null;
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true, role: true, deletedAt: true },
        });
        return user && !user.deletedAt ? { userId: user.id, email: user.email, role: user.role } : null;
    }
    catch {
        return null;
    }
}
async function resolveFirebaseToken(token) {
    try {
        ensureFirebaseAdmin();
        const decoded = await (0, auth_1.getAuth)().verifyIdToken(token, true);
        const email = decoded.email?.trim().toLowerCase();
        const mobile = normalizeMobile(decoded.phone_number);
        if (!mobile && (!email || decoded.email_verified !== true))
            return null;
        let user = await prisma_1.prisma.user.findUnique({
            where: { firebaseUid: decoded.uid },
            select: { id: true, email: true, role: true, firebaseUid: true, deletedAt: true },
        });
        // A deleted identity must never be recreated from the same Firebase token.
        if (user?.deletedAt)
            return null;
        if (!user) {
            user = await prisma_1.prisma.user.findFirst({
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
            user = await prisma_1.prisma.user.create({
                data: {
                    email: email ?? `firebase-${decoded.uid}@users.quizai.local`,
                    firebaseUid: decoded.uid,
                    mobile,
                    role: 'STUDENT',
                    profile: { create: { name: decoded.name?.trim() || 'Quiz AI Student' } },
                },
                select: { id: true, email: true, role: true, firebaseUid: true, deletedAt: true },
            });
        }
        else if (!user.firebaseUid) {
            user = await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: { firebaseUid: decoded.uid },
                select: { id: true, email: true, role: true, firebaseUid: true, deletedAt: true },
            });
        }
        return { userId: user.id, email: user.email, role: user.role };
    }
    catch {
        return null;
    }
}
/** Resolve either a Quiz AI access token or a Firebase ID token to one DB user. */
async function resolveAuthToken(token) {
    return (await resolveCustomJwt(token)) ?? resolveFirebaseToken(token);
}
function issueAccessToken(user) {
    return jsonwebtoken_1.default.sign({ userId: user.id }, jwt_1.JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: '2h',
        issuer: 'quiz-ai-api',
        audience: 'quiz-ai-clients',
        subject: user.id,
    });
}
