"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePremium = exports.requireSuperAdmin = exports.requireAdmin = exports.authenticate = void 0;
const prisma_1 = require("../prisma");
const authService_1 = require("../services/authService");
const authenticate = async (req, res, next) => {
    const authorization = req.headers.authorization || '';
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
        res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
        return;
    }
    try {
        const user = await (0, authService_1.resolveAuthToken)(token);
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'AUTH_INVALID', message: 'Invalid or expired token' } });
            return;
        }
        req.user = user;
        next();
    }
    catch {
        res.status(401).json({ success: false, error: { code: 'AUTH_INVALID', message: 'Invalid or expired token' } });
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
