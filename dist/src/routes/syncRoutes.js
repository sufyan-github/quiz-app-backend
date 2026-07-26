"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const realtimeService_1 = require("../services/realtimeService");
const router = (0, express_1.Router)();
router.get('/versions', (req, res) => {
    res.json({
        success: true,
        serverVersions: realtimeService_1.realtimeService.getModuleVersions(),
        timestamp: new Date().toISOString(),
    });
});
exports.default = router;
//# sourceMappingURL=syncRoutes.js.map