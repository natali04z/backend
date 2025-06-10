import express from "express";
import { 
    getDashboardData,
    addDashboardSale,
    addDashboardPurchase,
    getRecentActivities,
    getQuickStats,
    refreshDashboard,
    getDashboardSummary,
    getBranchPerformance
} from "../controllers/dashboard.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = express.Router();

// ===== RUTAS PRINCIPALES DEL DASHBOARD =====

/**
 * @route   GET /api/dashboard/data
 * @desc    Obtener todos los datos principales del dashboard con estadísticas completas
 * @access  Private (requiere permisos view_dashboard)
 * @params  ?period=month|week|today|year (opcional, default: month)
 * @controller getDashboardData ✅
 */
router.get("/data", authenticateUser, getDashboardData);

/**
 * @route   GET /api/dashboard/summary
 * @desc    Obtener resumen ejecutivo con totales generales
 * @access  Private (requiere permisos view_dashboard) 
 * @params  ?period=month|week|today|year (opcional, default: month)
 * @controller getDashboardSummary ✅
 */
router.get("/summary", authenticateUser, getDashboardSummary);

/**
 * @route   GET /api/dashboard/stats
 * @desc    Obtener estadísticas rápidas para widgets del dashboard
 * @access  Private (requiere permisos view_dashboard)
 * @params  ?period=month|week|today|year (opcional, default: month)
 * @controller getQuickStats ✅
 */
router.get("/stats", authenticateUser, getQuickStats);

/**
 * @route   GET /api/dashboard/activities
 * @desc    Obtener lista de actividades recientes (ventas, compras, etc.)
 * @access  Private (requiere permisos view_dashboard)
 * @params  ?limit=10 (opcional, máximo 50, default: 10)
 * @controller getRecentActivities ✅
 */
router.get("/activities", authenticateUser, getRecentActivities);

/**
 * @route   GET /api/dashboard/branch-performance
 * @desc    Obtener análisis de rendimiento por sucursal
 * @access  Private (requiere permisos view_dashboard)
 * @params  ?period=month|week|today|year (opcional, default: month)
 * @controller getBranchPerformance ✅
 */
router.get("/branch-performance", authenticateUser, getBranchPerformance);

// ===== RUTAS DE ACCIONES =====

/**
 * @route   POST /api/dashboard/sale
 * @desc    Registrar nueva venta para el dashboard (testing/manual)
 * @access  Private (requiere permisos create_sales)
 * @body    { amount: number, client: string }
 * @controller addDashboardSale ✅
 */
router.post("/sale", authenticateUser, addDashboardSale);

/**
 * @route   POST /api/dashboard/purchase  
 * @desc    Registrar nueva compra para el dashboard (testing/manual)
 * @access  Private (requiere permisos create_purchases)
 * @body    { amount: number, provider: string }
 * @controller addDashboardPurchase ✅
 */
router.post("/purchase", authenticateUser, addDashboardPurchase);

/**
 * @route   POST /api/dashboard/refresh
 * @desc    Forzar actualización manual de todos los datos del dashboard
 * @access  Private (requiere permisos view_dashboard)
 * @controller refreshDashboard ✅
 */
router.post("/refresh", authenticateUser, refreshDashboard);

// ===== RUTAS DE CONFIGURACIÓN PERSONALIZADA =====

/**
 * @route   GET /api/dashboard/config
 * @desc    Obtener configuración personalizada del usuario para el dashboard
 * @access  Private
 * @returns { widgets: {}, notifications: {}, autoRefresh: {}, appearance: {} }
 */
router.get("/config", authenticateUser, async (req, res) => {
    try {
        const { DashboardConfig } = await import("../models/dashboardActivity.js");
        
        let config = await DashboardConfig.findOne({ userId: req.user.id });
        
        if (!config) {
            // Crear configuración por defecto si no existe
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
                    interval: 30000 // 30 segundos
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
        console.error("Error fetching dashboard config:", error);
        res.status(500).json({ 
            success: false,
            message: "Error al obtener configuración del dashboard", 
            details: error.message 
        });
    }
});

/**
 * @route   PUT /api/dashboard/config
 * @desc    Actualizar configuración personalizada del usuario
 * @access  Private
 * @body    { widgets?: {}, notifications?: {}, autoRefresh?: {}, appearance?: {} }
 */
router.put("/config", authenticateUser, async (req, res) => {
    try {
        const { DashboardConfig } = await import("../models/dashboardActivity.js");
        
        const config = await DashboardConfig.findOneAndUpdate(
            { userId: req.user.id },
            { 
                $set: {
                    ...req.body,
                    updatedAt: new Date()
                }
            },
            { 
                new: true, 
                upsert: true, 
                runValidators: true 
            }
        );
        
        res.status(200).json({ 
            success: true,
            message: "Configuración del dashboard actualizada exitosamente",
            config,
            lastUpdate: new Date()
        });
    } catch (error) {
        console.error("Error updating dashboard config:", error);
        res.status(500).json({ 
            success: false,
            message: "Error al actualizar configuración del dashboard", 
            details: error.message 
        });
    }
});

// ===== RUTAS PENDIENTES DE IMPLEMENTAR =====
// Estas rutas necesitan que se implementen sus controladores correspondientes

/**
 * @route   GET /api/dashboard/charts-sales
 * @desc    Obtener datos específicos para gráficos de ventas
 * @access  Private (requiere permisos view_dashboard)
 * @params  ?period=month&chartType=daily|weekly|monthly
 * @todo    IMPLEMENTAR: getSalesChart en dashboard.controller.js
 */
router.get("/charts-sales", authenticateUser, (req, res) => {
    res.status(501).json({ 
        success: false,
        message: "Endpoint pendiente de implementación", 
        controller: "getSalesChart",
        location: "dashboard.controller.js",
        note: "Este controlador devolvería datos específicos para gráficos de ventas con diferentes granularidades"
    });
});

/**
 * @route   GET /api/dashboard/top-products
 * @desc    Obtener lista de productos más vendidos
 * @access  Private (requiere permisos view_dashboard)
 * @params  ?period=month&limit=10
 * @todo    IMPLEMENTAR: getTopProducts en dashboard.controller.js
 */
router.get("/top-products", authenticateUser, (req, res) => {
    res.status(501).json({ 
        success: false,
        message: "Endpoint pendiente de implementación", 
        controller: "getTopProducts",
        location: "dashboard.controller.js",
        note: "Este controlador devolvería los productos más vendidos con estadísticas detalladas"
    });
});

/**
 * @route   GET /api/dashboard/alerts-stock
 * @desc    Obtener alertas de inventario (stock bajo, productos vencidos)
 * @access  Private (requiere permisos view_dashboard)
 * @params  ?threshold=10 (umbral de stock bajo)
 * @todo    IMPLEMENTAR: getLowStockAlerts en dashboard.controller.js
 */
router.get("/alerts-stock", authenticateUser, (req, res) => {
    res.status(501).json({ 
        success: false,
        message: "Endpoint pendiente de implementación", 
        controller: "getLowStockAlerts",
        location: "dashboard.controller.js",
        note: "Este controlador devolvería alertas de stock bajo y productos próximos a vencer"
    });
});

// ===== RUTAS DE ADMINISTRACIÓN =====

/**
 * @route   DELETE /api/dashboard/activities-cleanup
 * @desc    Limpiar actividades antiguas del sistema (solo administradores)
 * @access  Private (requiere role: admin)
 * @params  ?days=30 (días de actividades a mantener, default: 30)
 */
router.delete("/activities-cleanup", authenticateUser, async (req, res) => {
    try {
        // Verificar permisos de administrador
        if (!req.user || req.user.role !== "admin") {
            return res.status(403).json({ 
                success: false,
                message: "Acceso denegado: Se requieren permisos de administrador" 
            });
        }
        
        const { days = 30 } = req.query;
        const daysToKeep = parseInt(days);
        
        if (daysToKeep < 1 || daysToKeep > 365) {
            return res.status(400).json({
                success: false,
                message: "El parámetro 'days' debe estar entre 1 y 365"
            });
        }
        
        const { DashboardActivity } = await import("../models/dashboardActivity.js");
        const deleted = await DashboardActivity.cleanOldActivities(daysToKeep);
        
        res.status(200).json({ 
            success: true,
            message: `Actividades antiguas eliminadas exitosamente`,
            deletedCount: deleted.deletedCount,
            daysKept: daysToKeep,
            cleanupDate: new Date()
        });
    } catch (error) {
        console.error("Error cleaning up activities:", error);
        res.status(500).json({ 
            success: false,
            message: "Error al limpiar actividades antiguas", 
            details: error.message 
        });
    }
});

/**
 * @route   PUT /api/dashboard/activities-archive
 * @desc    Archivar actividades antiguas (solo administradores)
 * @access  Private (requiere role: admin)
 * @params  ?days=90 (días antes de archivar, default: 90)
 */
router.put("/activities-archive", authenticateUser, async (req, res) => {
    try {
        // Verificar permisos de administrador
        if (!req.user || req.user.role !== "admin") {
            return res.status(403).json({ 
                success: false,
                message: "Acceso denegado: Se requieren permisos de administrador" 
            });
        }
        
        const { days = 90 } = req.query;
        const daysToArchive = parseInt(days);
        
        if (daysToArchive < 1 || daysToArchive > 730) {
            return res.status(400).json({
                success: false,
                message: "El parámetro 'days' debe estar entre 1 y 730"
            });
        }
        
        const { DashboardActivity } = await import("../models/dashboardActivity.js");
        const archived = await DashboardActivity.archiveOldActivities(daysToArchive);
        
        res.status(200).json({ 
            success: true,
            message: `Actividades archivadas exitosamente`,
            archivedCount: archived.modifiedCount,
            daysThreshold: daysToArchive,
            archiveDate: new Date()
        });
    } catch (error) {
        console.error("Error archiving activities:", error);
        res.status(500).json({ 
            success: false,
            message: "Error al archivar actividades", 
            details: error.message 
        });
    }
});

// ===== RUTAS DE DESARROLLO/TESTING =====

/**
 * @route   POST /api/dashboard/test-populate
 * @desc    Poblar dashboard con datos de prueba (solo en desarrollo)
 * @access  Private (solo disponible cuando NODE_ENV !== 'production')
 * @body    { salesCount?: number, purchasesCount?: number }
 */
router.post("/test-populate", authenticateUser, async (req, res) => {
    try {
        // Solo permitir en entornos de desarrollo
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ 
                success: false,
                message: "Esta funcionalidad no está disponible en producción" 
            });
        }
        
        const { salesCount = 10, purchasesCount = 5 } = req.body;
        const { DashboardActivity } = await import("../models/dashboardActivity.js");
        const mongoose = await import("mongoose");
        
        const testActivities = [];
        
        // Crear actividades de venta de prueba
        for (let i = 0; i < salesCount; i++) {
            const activity = await DashboardActivity.createSaleActivity({
                saleId: new mongoose.Types.ObjectId(),
                customerName: `Cliente Test ${i + 1}`,
                amount: Math.floor(Math.random() * 5000) + 1000,
                products: Math.floor(Math.random() * 5) + 1,
                status: "completed"
            }, req.user.id);
            
            testActivities.push(activity);
        }
        
        // Crear actividades de compra de prueba
        for (let i = 0; i < purchasesCount; i++) {
            const activity = await DashboardActivity.createPurchaseActivity({
                purchaseId: new mongoose.Types.ObjectId(),
                providerName: `Proveedor Test ${i + 1}`,
                amount: Math.floor(Math.random() * 3000) + 500,
                products: Math.floor(Math.random() * 8) + 1,
                status: "active"
            }, req.user.id);
            
            testActivities.push(activity);
        }
        
        res.status(201).json({ 
            success: true,
            message: "Datos de prueba creados exitosamente",
            activitiesCreated: testActivities.length,
            salesCreated: salesCount,
            purchasesCreated: purchasesCount,
            createdAt: new Date()
        });
    } catch (error) {
        console.error("Error creating test data:", error);
        res.status(500).json({ 
            success: false,
            message: "Error al crear datos de prueba", 
            details: error.message 
        });
    }
});

// ===== MANEJO DE RUTAS NO ENCONTRADAS =====
// Debe ser la ÚLTIMA ruta definida
router.use((req, res) => {
    res.status(404).json({ 
        success: false,
        message: "Ruta del dashboard no encontrada",
        requestedPath: req.originalUrl,
        availableRoutes: {
            implemented: [
                "GET /data - Datos principales del dashboard",
                "GET /summary - Resumen ejecutivo", 
                "GET /stats - Estadísticas rápidas",
                "GET /activities - Actividades recientes",
                "GET /branch-performance - Rendimiento por sucursal",
                "POST /sale - Registrar venta",
                "POST /purchase - Registrar compra",
                "POST /refresh - Actualizar dashboard",
                "GET /config - Configuración del usuario",
                "PUT /config - Actualizar configuración"
            ],
            pending: [
                "GET /charts-sales - Datos para gráficos",
                "GET /top-products - Productos más vendidos",
                "GET /alerts-stock - Alertas de inventario"
            ],
            admin: [
                "DELETE /activities-cleanup - Limpiar actividades",
                "PUT /activities-archive - Archivar actividades"
            ],
            development: [
                "POST /test-populate - Datos de prueba"
            ]
        },
        timestamp: new Date()
    });
});

export default router;