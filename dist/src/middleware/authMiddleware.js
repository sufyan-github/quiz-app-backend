"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePremium = exports.requireSuperAdmin = exports.requireAdmin = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../prisma");
const jwt_1 = require("../config/jwt");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
// Initialize firebase admin if not already initialized
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)({
        credential: (0, app_1.applicationDefault)(), // Assumes GOOGLE_APPLICATION_CREDENTIALS is set, or running on GCP
    });
}
const authenticate = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    try {
        // First, verify the Firebase ID token
        const decodedToken = await (0, auth_1.getAuth)().verifyIdToken(token);
        // Now look up the user in our PostgreSQL database using Prisma
        const user = await prisma_1.prisma.user.findUnique({ where: { id: decodedToken.uid } });
        req.user = {
            userId: decodedToken.uid,
            email: decodedToken.email || '',
            role: user?.role || 'USER',
        };
        next();
    }
    catch (error) {
        // Fallback to JWT for legacy sessions or admin testing during migration
        try {
            const decoded = jsonwebtoken_1.default.verify(token, jwt_1.JWT_SECRET);
            req.user = decoded;
            next();
        }
        catch (fallbackError) {
            res.status(403).json({ error: 'Invalid or expired token' });
            return;
        }
    }
};
exports.authenticate = authenticate;
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
};
exports.requireAdmin = requireAdmin;
const requireSuperAdmin = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    if (req.user.role !== 'SUPER_ADMIN') {
        res.status(403).json({ error: 'Super Admin access required' });
        return;
    }
    next();
};
exports.requireSuperAdmin = requireSuperAdmin;
const requirePremium = async (req, res, next) => {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.userId },
            include: {
                userSubscriptions: {
                    where: {
                        status: 'ACTIVE',
                        endDate: { gt: new Date() }
                    }
                }
            }
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const isPremium = user.subscription_status === 'REGISTERED' || user.userSubscriptions.length > 0;
        if (!isPremium) {
            res.status(402).json({
                success: false,
                requirePaywall: true,
                message: 'Premium subscription required to access this feature.'
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.requirePremium = requirePremium;
//# sourceMappingURL=authMiddleware.js.map