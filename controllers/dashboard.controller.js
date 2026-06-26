import mongoose from "mongoose";
import Purchase from "../models/purchase.js";
import Sale from "../models/sales.js";
import Product from "../models/product.js";
import Customer from "../models/customer.js";
import Provider from "../models/provider.js";
import Branch from "../models/branches.js";
import { checkPermission } from "../utils/permissions.js";

// ===== FUNCIONES HELPER OPTIMIZADAS =====

/**
 * Cache para almacenar datos frecuentemente consultados
 */
const dashboardCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Función helper para obtener datos desde cache o BD
 */
function getCachedData(key, fetchFunction, ttl = CACHE_TTL) {
    const cached = dashboardCache.get(key);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < ttl) {
        return Promise.resolve(cached.data);
    }
    
    return fetchFunction().then(data => {
        dashboardCache.set(key, {
            data,
            timestamp: now
        });
        return data;
    });
}

/**
 * Obtiene el rango de fechas para filtros
 */
function getDateRange(period = "month") {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
        case "today":
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            break;
        case "week":
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            startOfWeek.setHours(0, 0, 0, 0);
            startDate = startOfWeek;
            endDate = new Date(startOfWeek);
            endDate.setDate(startOfWeek.getDate() + 7);
            break;
        case "month":
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            break;
        case "year":
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear() + 1, 0, 1);
            break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    return { startDate, endDate };
}

/**
 * Formatea tiempo relativo
 */
function formatRelativeTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `Hace ${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `Hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    return 'Hace unos momentos';
}

// ===== FUNCIONES DE DATOS OPTIMIZADAS =====

/**
 * Obtener todas las estadísticas en una sola consulta optimizada
 */
async function getOptimizedDashboardStats(period = "month") {
    const { startDate, endDate } = getDateRange(period);
    const cacheKey = `dashboard_stats_${period}_${startDate.getTime()}`;
    
    return getCachedData(cacheKey, async () => {
        // Pipeline de agregación optimizado que obtiene todo de una vez
        const [salesData, purchasesData, countsData, activitiesData] = await Promise.all([
            // Ventas actuales y del período anterior
            Sale.aggregate([
                {
                    $facet: {
                        current: [
                            { $match: { salesDate: { $gte: startDate, $lt: endDate } } },
                            {
                                $group: {
                                    _id: null,
                                    total: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$total", 0] } },
                                    transactions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                                    avgOrderValue: { $avg: "$total" },
                                    totalSales: { $sum: 1 }
                                }
                            }
                        ],
                        previous: (() => {
                            const prevStart = new Date(startDate);
                            const prevEnd = new Date(endDate);
                            
                            if (period === "month") {
                                prevStart.setMonth(prevStart.getMonth() - 1);
                                prevEnd.setMonth(prevEnd.getMonth() - 1);
                            } else if (period === "week") {
                                prevStart.setDate(prevStart.getDate() - 7);
                                prevEnd.setDate(prevEnd.getDate() - 7);
                            }
                            
                            return [
                                { $match: { salesDate: { $gte: prevStart, $lt: prevEnd }, status: "completed" } },
                                { $group: { _id: null, total: { $sum: "$total" } } }
                            ];
                        })(),
                        chartData: [
                            { $match: { status: "completed" } },
                            {
                                $group: {
                                    _id: {
                                        year: { $year: "$salesDate" },
                                        month: { $month: "$salesDate" },
                                        day: { $dayOfMonth: "$salesDate" }
                                    },
                                    total: { $sum: "$total" }
                                }
                            },
                            { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } },
                            { $limit: 30 }
                        ]
                    }
                }
            ]),
            
            // Compras actuales y del período anterior
            Purchase.aggregate([
                {
                    $facet: {
                        current: [
                            { $match: { purchase_date: { $gte: startDate, $lt: endDate } } },
                            {
                                $group: {
                                    _id: null,
                                    total: { $sum: { $cond: [{ $eq: ["$status", "active"] }, "$total", 0] } },
                                    orders: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                                    avgOrderValue: { $avg: "$total" },
                                    totalPurchases: { $sum: 1 }
                                }
                            }
                        ],
                        previous: (() => {
                            const prevStart = new Date(startDate);
                            const prevEnd = new Date(endDate);
                            
                            if (period === "month") {
                                prevStart.setMonth(prevStart.getMonth() - 1);
                                prevEnd.setMonth(prevEnd.getMonth() - 1);
                            } else if (period === "week") {
                                prevStart.setDate(prevStart.getDate() - 7);
                                prevEnd.setDate(prevEnd.getDate() - 7);
                            }
                            
                            return [
                                { $match: { purchase_date: { $gte: prevStart, $lt: prevEnd }, status: "active" } },
                                { $group: { _id: null, total: { $sum: "$total" } } }
                            ];
                        })(),
                        chartData: [
                            { $match: { status: "active" } },
                            {
                                $group: {
                                    _id: {
                                        year: { $year: "$purchase_date" },
                                        month: { $month: "$purchase_date" },
                                        day: { $dayOfMonth: "$purchase_date" }
                                    },
                                    total: { $sum: "$total" }
                                }
                            },
                            { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } },
                            { $limit: 30 }
                        ]
                    }
                }
            ]),
            
            // Conteos generales
            Promise.all([
                Customer.countDocuments({ status: "active" }),
                Product.countDocuments({ status: "active" }),
                Product.countDocuments({ status: "active", stock: { $lte: 10 } })
            ]),
            
            // Actividades recientes optimizadas
            getOptimizedRecentActivities(10)
        ]);

        // Procesar y estructurar los datos
        const currentSales = salesData[0]?.current[0] || {};
        const previousSales = salesData[0]?.previous[0]?.total || 1;
        const currentPurchases = purchasesData[0]?.current[0] || {};
        const previousPurchases = purchasesData[0]?.previous[0]?.total || 1;

        // Calcular crecimientos
        const salesGrowth = previousSales > 0 ? 
            Math.round(((currentSales.total - previousSales) / previousSales) * 100) : 0;
        const purchasesReduction = previousPurchases > 0 ? 
            Math.round(((previousPurchases - currentPurchases.total) / previousPurchases) * 100) : 0;

        return {
            sales: {
                thisMonth: Math.round(currentSales.total || 0),
                transactions: currentSales.transactions || 0,
                growth: Math.max(0, salesGrowth),
                totalSales: currentSales.totalSales || 0,
                avgOrderValue: Math.round(currentSales.avgOrderValue || 0)
            },
            purchases: {
                thisMonth: Math.round(currentPurchases.total || 0),
                orders: currentPurchases.orders || 0,
                reduction: Math.max(0, purchasesReduction),
                totalPurchases: currentPurchases.totalPurchases || 0,
                avgOrderValue: Math.round(currentPurchases.avgOrderValue || 0)
            },
            counts: {
                customers: countsData[0] || 0,
                products: countsData[1] || 0,
                lowStock: countsData[2] || 0
            },
            activities: activitiesData,
            chartData: {
                salesTrend: salesData[0]?.chartData?.map(d => d.total) || [],
                purchasesTrend: purchasesData[0]?.chartData?.map(d => d.total) || []
            },
            period,
            dateRange: {
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
            },
            lastUpdate: new Date()
        };
    });
}

/**
 * Obtener actividades recientes optimizadas
 */
async function getOptimizedRecentActivities(limit = 10) {
    const cacheKey = `recent_activities_${limit}`;
    
    return getCachedData(cacheKey, async () => {
        // Una sola consulta con facet para obtener ambos tipos de actividades
        const [salesActivities, purchasesActivities] = await Promise.all([
            Sale.find()
                .populate("customer", "name lastname")
                .sort({ createdAt: -1 })
                .limit(limit)
                .select("customer total status createdAt")
                .lean(), // lean() para mejor performance
                
            Purchase.find()
                .populate("provider", "company")
                .sort({ createdAt: -1 })
                .limit(limit)
                .select("provider total status createdAt")
                .lean()
        ]);

        // Formatear y combinar
        const formattedSales = salesActivities.map(sale => ({
            id: sale._id,
            icon: '💰',
            title: `Nueva venta - ${sale.customer?.name || 'Cliente'} ${sale.customer?.lastname || ''}`,
            time: sale.createdAt,
            type: 'sale',
            amount: sale.total,
            status: sale.status,
            relativeTime: formatRelativeTime(sale.createdAt)
        }));

        const formattedPurchases = purchasesActivities.map(purchase => ({
            id: purchase._id,
            icon: '🛒',
            title: `Compra realizada - ${purchase.provider?.company || 'Proveedor'}`,
            time: purchase.createdAt,
            type: 'purchase',
            amount: purchase.total,
            status: purchase.status,
            relativeTime: formatRelativeTime(purchase.createdAt)
        }));

        return [...formattedSales, ...formattedPurchases]
            .sort((a, b) => new Date(b.time) - new Date(a.time))
            .slice(0, limit);
    }, 2 * 60 * 1000); // Cache por 2 minutos para actividades
}

// ===== CONTROLADORES OPTIMIZADOS =====

/**
 * 🚀 ENDPOINT PRINCIPAL - Un solo endpoint para todos los datos del dashboard
 */
export const getDashboardData = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "view_dashboard")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { period = "month", sections = "all" } = req.query;
        
        // Obtener todos los datos optimizados de una vez
        const dashboardData = await getOptimizedDashboardStats(period);
        
        // Permitir obtener solo secciones específicas para reducir payload
        if (sections !== "all") {
            const requestedSections = sections.split(',');
            const filteredData = {};
            
            requestedSections.forEach(section => {
                if (dashboardData[section]) {
                    filteredData[section] = dashboardData[section];
                }
            });
            
            filteredData.lastUpdate = dashboardData.lastUpdate;
            filteredData.period = dashboardData.period;
            
            return res.status(200).json(filteredData);
        }

        res.status(200).json(dashboardData);
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).json({ 
            message: "Server error", 
            details: error.message 
        });
    }
};

/**
 * Obtener solo estadísticas rápidas (deprecado - usar getDashboardData con sections=counts)
 */
export const getQuickStats = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "view_dashboard")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        // Redirigir a la función optimizada
        req.query.sections = "counts,sales,purchases";
        return getDashboardData(req, res);
    } catch (error) {
        console.error("Error fetching quick stats:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

/**
 * Obtener solo actividades recientes (deprecado - usar getDashboardData con sections=activities)
 */
export const getRecentActivities = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "view_dashboard")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { limit = 10 } = req.query;
        const activities = await getOptimizedRecentActivities(parseInt(limit));

        res.status(200).json({
            activities,
            lastUpdate: new Date()
        });
    } catch (error) {
        console.error("Error fetching recent activities:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

/**
 * Obtener resumen del dashboard (deprecado - usar getDashboardData con sections=sales,purchases,counts)
 */
export const getDashboardSummary = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "view_dashboard")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        // Redirigir a la función optimizada
        req.query.sections = "sales,purchases,counts";
        return getDashboardData(req, res);
    } catch (error) {
        console.error("Error fetching dashboard summary:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

/**
 * Limpiar cache del dashboard
 */
export const clearDashboardCache = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "view_dashboard")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        dashboardCache.clear();
        
        res.status(200).json({ 
            message: "Cache cleared successfully",
            timestamp: new Date()
        });
    } catch (error) {
        console.error("Error clearing cache:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

/**
 * Refrescar datos del dashboard (limpiar cache y obtener datos frescos)
 */
export const refreshDashboard = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "view_dashboard")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        // Limpiar cache para forzar datos frescos
        dashboardCache.clear();
        
        // Obtener datos frescos
        req.query.period = req.query.period || "month";
        return getDashboardData(req, res);
    } catch (error) {
        console.error("Error refreshing dashboard:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// ===== CONTROLADORES DE RENDIMIENTO POR SUCURSAL =====

/**
 * Obtener rendimiento por sucursal (optimizado)
 */
export const getBranchPerformance = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "view_dashboard")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { period = "month" } = req.query;
        const { startDate, endDate } = getDateRange(period);
        const cacheKey = `branch_performance_${period}_${startDate.getTime()}`;

        const branchData = await getCachedData(cacheKey, async () => {
            // Pipeline optimizado que obtiene ventas y compras por sucursal en una consulta
            const [salesByBranch, purchasesByBranch] = await Promise.all([
                Sale.aggregate([
                    { $match: { salesDate: { $gte: startDate, $lt: endDate }, status: "completed" } },
                    {
                        $lookup: {
                            from: "branches",
                            localField: "branch",
                            foreignField: "_id",
                            as: "branchInfo"
                        }
                    },
                    { $unwind: { path: "$branchInfo", preserveNullAndEmptyArrays: true } },
                    {
                        $group: {
                            _id: "$branch",
                            branchName: { $first: { $ifNull: ["$branchInfo.name", "Sin Sucursal"] } },
                            totalSales: { $sum: "$total" },
                            totalTransactions: { $sum: 1 },
                            avgOrderValue: { $avg: "$total" },
                            maxSale: { $max: "$total" },
                            minSale: { $min: "$total" }
                        }
                    },
                    { $sort: { totalSales: -1 } }
                ]),

                Purchase.aggregate([
                    { $match: { purchase_date: { $gte: startDate, $lt: endDate }, status: "active" } },
                    {
                        $group: {
                            _id: "$branch",
                            totalPurchases: { $sum: "$total" },
                            totalOrders: { $sum: 1 }
                        }
                    }
                ])
            ]);

            // Combinar datos
            const purchaseMap = new Map(
                purchasesByBranch.map(p => [p._id?.toString(), p])
            );

            const combinedData = salesByBranch.map(branch => {
                const purchaseData = purchaseMap.get(branch._id?.toString()) || {};
                const totalPurchases = purchaseData.totalPurchases || 0;
                const profit = branch.totalSales - totalPurchases;

                return {
                    branchId: branch._id,
                    branchName: branch.branchName,
                    sales: {
                        total: Math.round(branch.totalSales),
                        transactions: branch.totalTransactions,
                        avgOrderValue: Math.round(branch.avgOrderValue),
                        maxSale: Math.round(branch.maxSale),
                        minSale: Math.round(branch.minSale)
                    },
                    purchases: {
                        total: Math.round(totalPurchases),
                        orders: purchaseData.totalOrders || 0
                    },
                    profit: Math.round(profit),
                    efficiency: branch.totalSales > 0 ? 
                        Math.round((profit / branch.totalSales) * 100) : 0
                };
            });

            return combinedData;
        });

        // Calcular totales
        const totals = branchData.reduce((acc, branch) => ({
            totalSales: acc.totalSales + branch.sales.total,
            totalTransactions: acc.totalTransactions + branch.sales.transactions,
            totalPurchases: acc.totalPurchases + branch.purchases.total,
            totalProfit: acc.totalProfit + branch.profit
        }), { totalSales: 0, totalTransactions: 0, totalPurchases: 0, totalProfit: 0 });

        totals.averageEfficiency = branchData.length > 0 ? 
            Math.round(branchData.reduce((sum, branch) => sum + branch.efficiency, 0) / branchData.length) : 0;

        res.status(200).json({
            branchPerformance: branchData,
            totals,
            period,
            dateRange: {
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
            },
            lastUpdate: new Date()
        });
    } catch (error) {
        console.error("Error fetching branch performance:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// ===== CONTROLADORES DE TESTING =====

/**
 * Agregar venta de prueba (simplificado)
 */
export const addDashboardSale = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "create_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { amount, client } = req.body;

        if (!amount || amount <= 0 || !client) {
            return res.status(400).json({ 
                message: "Amount (positive number) and client name are required" 
            });
        }

        // Limpiar cache para reflejar nueva venta
        dashboardCache.clear();

        res.status(200).json({ 
            message: "Sale activity registered",
            activity: {
                id: new Date().getTime(),
                icon: '💰',
                title: `Nueva venta - Cliente: ${client}`,
                time: new Date(),
                type: 'sale',
                amount: amount,
                relativeTime: 'Hace unos momentos'
            },
            success: true
        });
    } catch (error) {
        console.error("Error adding dashboard sale:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

/**
 * Agregar compra de prueba (simplificado)
 */
export const addDashboardPurchase = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "create_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { amount, provider } = req.body;

        if (!amount || amount <= 0 || !provider) {
            return res.status(400).json({ 
                message: "Amount (positive number) and provider name are required" 
            });
        }

        // Limpiar cache para reflejar nueva compra
        dashboardCache.clear();

        res.status(200).json({ 
            message: "Purchase activity registered",
            activity: {
                id: new Date().getTime(),
                icon: '🛒',
                title: `Compra realizada - Proveedor: ${provider}`,
                time: new Date(),
                type: 'purchase',
                amount: amount,
                relativeTime: 'Hace unos momentos'
            },
            success: true
        });
    } catch (error) {
        console.error("Error adding dashboard purchase:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};