import express from "express";
import { 
    getDashboardData,
    addDashboardSale,
    addDashboardPurchase,
    getRecentActivities,
    getQuickStats,
    getDashboardSummary,
    getBranchPerformance
} from "../controllers/dashboard.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = express.Router();

// ===== RUTAS PRINCIPALES OPTIMIZADAS =====

/**
 * @route   GET /api/dashboard
 * @desc    Obtener dashboard completo con todos los datos (unificado)
 * @access  Private
 * @params  ?period=month|week|today|year&type=full|summary|stats
 */
router.get("/", authenticateUser, async (req, res) => {
    const { type = "full" } = req.query;
    
    try {
        switch (type) {
            case "summary":
                return await getDashboardSummary(req, res);
            case "stats":
                return await getQuickStats(req, res);
            default:
                return await getDashboardData(req, res);
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: "Error al obtener datos del dashboard" 
        });
    }
});

/**
 * @route   GET /api/dashboard/activities
 * @desc    Obtener actividades recientes
 * @access  Private
 * @params  ?limit=10
 */
router.get("/activities", authenticateUser, getRecentActivities);

/**
 * @route   GET /api/dashboard/branch-performance
 * @desc    Obtener rendimiento por sucursal
 * @access  Private
 * @params  ?period=month|week|today|year
 */
router.get("/branch-performance", authenticateUser, getBranchPerformance);

/**
 * @route   GET /api/dashboard/refresh
 * @desc    Refrescar datos del dashboard (ahora GET)
 * @access  Private
 */
router.get("/refresh", authenticateUser, async (req, res) => {
    try {
        // Simplemente devolver datos frescos
        await getDashboardData(req, res);
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: "Error al refrescar dashboard" 
        });
    }
});

// ===== RUTAS DE ACCIONES (SOLO LAS NECESARIAS) =====

/**
 * @route   POST /api/dashboard/sale
 * @desc    Registrar nueva venta (solo para testing/manual)
 * @access  Private
 */
router.post("/sale", authenticateUser, addDashboardSale);

/**
 * @route   POST /api/dashboard/purchase
 * @desc    Registrar nueva compra (solo para testing/manual)
 * @access  Private
 */
router.post("/purchase", authenticateUser, addDashboardPurchase);

// ===== CONFIGURACIÓN DEL USUARIO =====

/**
 * @route   GET /api/dashboard/config
 * @desc    Obtener configuración del dashboard del usuario
 * @access  Private
 */
router.get("/config", authenticateUser, async (req, res) => {
    try {
        const { DashboardConfig } = await import("../models/dashboardActivity.js");
        
        let config = await DashboardConfig.findOne({ userId: req.user.id });
        
        if (!config) {
            config = new DashboardConfig({ 
                userId: req.user.id,
                widgets: {
                    sales: { enabled: true, position: 1 },
                    purchases: { enabled: true, position: 2 },
                    activities: { enabled: true, position: 3 },
                    charts: { enabled: true, position: 4 }
                },
                notifications: {
                    lowStock: true,
                    newSales: true,
                    dailyReports: false
                },
                autoRefresh: {
                    enabled: true,
                    interval: 30000
                },
                appearance: {
                    theme: "light",
                    compactMode: false
                }
            });
            await config.save();
        }
        
        res.status(200).json({
            success: true,
            config,
            lastUpdate: new Date()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: "Error al obtener configuración", 
            details: error.message 
        });
    }
});

/**
 * @route   PUT /api/dashboard/config
 * @desc    Actualizar configuración del dashboard
 * @access  Private
 */
router.put("/config", authenticateUser, async (req, res) => {
    try {
        const { DashboardConfig } = await import("../models/dashboardActivity.js");
        
        const config = await DashboardConfig.findOneAndUpdate(
            { userId: req.user.id },
            { 
                $set: { ...req.body, updatedAt: new Date() }
            },
            { new: true, upsert: true, runValidators: true }
        );
        
        res.status(200).json({ 
            success: true,
            message: "Configuración actualizada exitosamente",
            config
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: "Error al actualizar configuración", 
            details: error.message 
        });
    }
});

// ===== RUTAS PENDIENTES (SIMPLIFICADAS) =====

/**
 * @route   GET /api/dashboard/charts
 * @desc    Obtener datos para gráficos específicos
 * @access  Private
 * @params  ?type=sales|purchases&period=month
 */
router.get("/charts", authenticateUser, (req, res) => {
    res.status(501).json({ 
        success: false,
        message: "Endpoint pendiente de implementación",
        note: "Usar GET /api/dashboard?type=full para obtener datos de gráficos"
    });
});

/**
 * @route   GET /api/dashboard/products/top
 * @desc    Obtener productos más vendidos
 * @access  Private
 */
router.get("/products/top", authenticateUser, (req, res) => {
    res.status(501).json({ 
        success: false,
        message: "Endpoint pendiente de implementación"
    });
});

/**
 * @route   GET /api/dashboard/alerts
 * @desc    Obtener alertas del sistema
 * @access  Private
 */
router.get("/alerts", authenticateUser, (req, res) => {
    res.status(501).json({ 
        success: false,
        message: "Endpoint pendiente de implementación"
    });
});

// ===== RUTAS DE ADMINISTRACIÓN (SOLO ADMIN) =====

/**
 * @route   DELETE /api/dashboard/maintenance
 * @desc    Limpiar datos antiguos
 * @access  Admin only
 */
router.delete("/maintenance", authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ 
                success: false,
                message: "Acceso denegado" 
            });
        }
        
        const { action, days = 30 } = req.query;
        const { DashboardActivity } = await import("../models/dashboardActivity.js");
        
        let result;
        if (action === "cleanup") {
            result = await DashboardActivity.cleanOldActivities(parseInt(days));
        } else if (action === "archive") {
            result = await DashboardActivity.archiveOldActivities(parseInt(days));
        } else {
            return res.status(400).json({
                success: false,
                message: "Acción no válida. Use: cleanup o archive"
            });
        }
        
        res.status(200).json({ 
            success: true,
            message: `${action} completado exitosamente`,
            result
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: "Error en mantenimiento", 
            details: error.message 
        });
    }
});

// ===== SOLO PARA DESARROLLO =====
if (process.env.NODE_ENV !== 'production') {
    /**
     * @route   POST /api/dashboard/dev/populate
     * @desc    Generar datos de prueba (solo desarrollo)
     * @access  Private
     */
    router.post("/dev/populate", authenticateUser, async (req, res) => {
        try {
            const { salesCount = 10, purchasesCount = 5 } = req.body;
            
            // Lógica para generar datos de prueba...
            
            res.status(201).json({ 
                success: true,
                message: "Datos de prueba creados",
                salesCreated: salesCount,
                purchasesCreated: purchasesCount
            });
        } catch (error) {
            res.status(500).json({ 
                success: false,
                message: "Error creando datos de prueba" 
            });
        }
    });
}

// ===== MANEJO DE RUTAS NO ENCONTRADAS =====
router.use((req, res) => {
    res.status(404).json({ 
        success: false,
        message: "Ruta no encontrada",
        availableRoutes: [
            "GET / - Dashboard completo",
            "GET /activities - Actividades recientes",
            "GET /branch-performance - Rendimiento por sucursal",
            "GET /refresh - Refrescar datos",
            "GET /config - Configuración usuario",
            "PUT /config - Actualizar configuración"
        ]
    });
});

export default router;