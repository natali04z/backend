import mongoose from "mongoose";

// ===== MODELO PARA ACTIVIDADES DEL DASHBOARD =====

const activitySchema = new mongoose.Schema({
    // ID personalizado para el frontend
    activityId: {
        type: String,
        required: true,
        unique: true
    },
    
    // Tipo de actividad
    type: {
        type: String,
        required: true,
        enum: ['sale', 'purchase', 'customer', 'product', 'inventory', 'user', 'system'],
        default: 'system'
    },
    
    // Icono de la actividad (emoji)
    icon: {
        type: String,
        required: true,
        default: '📋'
    },
    
    // Título descriptivo de la actividad
    title: {
        type: String,
        required: true,
        maxlength: 200
    },
    
    // Descripción detallada (opcional)
    description: {
        type: String,
        maxlength: 500
    },
    
    // Usuario que realizó la actividad
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    
    // Referencia al documento relacionado (venta, compra, etc.)
    relatedId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false
    },
    
    // Modelo del documento relacionado
    relatedModel: {
        type: String,
        enum: ['Sale', 'Purchase', 'Product', 'Customer', 'Provider', 'Branch', 'User'],
        required: false
    },
    
    // Monto relacionado (para ventas/compras)
    amount: {
        type: Number,
        min: 0
    },
    
    // Datos adicionales en formato JSON
    metadata: {
        customerName: String,
        providerName: String,
        productName: String,
        branchName: String,
        quantity: Number,
        status: String,
        previousValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed
    },
    
    // Estado de la actividad
    status: {
        type: String,
        enum: ['active', 'archived', 'deleted'],
        default: 'active'
    },
    
    // Prioridad de la actividad
    priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'critical'],
        default: 'normal'
    },
    
    // Si es visible en el dashboard
    isVisible: {
        type: Boolean,
        default: true
    },
    
    // Fecha de la actividad (puede ser diferente a createdAt)
    activityDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true // Agrega createdAt y updatedAt automáticamente
});

// ===== ÍNDICES PARA OPTIMIZACIÓN =====
activitySchema.index({ type: 1, activityDate: -1 });
activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ status: 1, isVisible: 1, createdAt: -1 });
activitySchema.index({ relatedId: 1, relatedModel: 1 });

// ===== MÉTODOS ESTÁTICOS =====

// Crear actividad de venta
activitySchema.statics.createSaleActivity = async function(saleData, userId = null) {
    const activityId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return this.create({
        activityId,
        type: 'sale',
        icon: '💰',
        title: `Nueva venta registrada - Cliente: ${saleData.customerName || 'Cliente'}`,
        description: `Venta por $${saleData.amount?.toLocaleString() || '0'} - ${saleData.products || 0} productos`,
        userId,
        relatedId: saleData.saleId,
        relatedModel: 'Sale',
        amount: saleData.amount,
        metadata: {
            customerName: saleData.customerName,
            branchName: saleData.branchName,
            quantity: saleData.products,
            status: saleData.status
        },
        priority: saleData.amount > 10000 ? 'high' : 'normal'
    });
};

// Crear actividad de compra
activitySchema.statics.createPurchaseActivity = async function(purchaseData, userId = null) {
    const activityId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return this.create({
        activityId,
        type: 'purchase',
        icon: '🛒',
        title: `Compra realizada - Proveedor: ${purchaseData.providerName || 'Proveedor'}`,
        description: `Compra por $${purchaseData.amount?.toLocaleString() || '0'} - ${purchaseData.products || 0} productos`,
        userId,
        relatedId: purchaseData.purchaseId,
        relatedModel: 'Purchase',
        amount: purchaseData.amount,
        metadata: {
            providerName: purchaseData.providerName,
            quantity: purchaseData.products,
            status: purchaseData.status
        },
        priority: purchaseData.amount > 15000 ? 'high' : 'normal'
    });
};

// Crear actividad de cliente
activitySchema.statics.createCustomerActivity = async function(customerData, action = 'created', userId = null) {
    const activityId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const actionTexts = {
        created: 'Nuevo cliente registrado',
        updated: 'Cliente actualizado',
        activated: 'Cliente activado',
        deactivated: 'Cliente desactivado'
    };
    
    return this.create({
        activityId,
        type: 'customer',
        icon: '👤',
        title: `${actionTexts[action] || 'Actividad de cliente'} - ${customerData.name || 'Cliente'}`,
        description: `${customerData.email ? `Email: ${customerData.email}` : ''} ${customerData.phone ? `Tel: ${customerData.phone}` : ''}`.trim(),
        userId,
        relatedId: customerData.customerId,
        relatedModel: 'Customer',
        metadata: {
            customerName: `${customerData.name || ''} ${customerData.lastname || ''}`.trim(),
            status: customerData.status
        }
    });
};

// Crear actividad de producto
activitySchema.statics.createProductActivity = async function(productData, action = 'created', userId = null) {
    const activityId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const actionTexts = {
        created: 'Nuevo producto agregado',
        updated: 'Producto actualizado',
        lowStock: 'Stock bajo detectado',
        outOfStock: 'Producto agotado',
        expired: 'Producto vencido'
    };
    
    return this.create({
        activityId,
        type: action === 'lowStock' || action === 'outOfStock' ? 'inventory' : 'product',
        icon: action === 'lowStock' ? '⚠️' : action === 'outOfStock' ? '🚫' : action === 'expired' ? '⏰' : '📦',
        title: `${actionTexts[action] || 'Actividad de producto'} - ${productData.name || 'Producto'}`,
        description: `Stock: ${productData.stock || 0} | Precio: $${productData.price?.toLocaleString() || '0'}`,
        userId,
        relatedId: productData.productId,
        relatedModel: 'Product',
        metadata: {
            productName: productData.name,
            quantity: productData.stock,
            status: productData.status,
            previousValue: productData.previousStock,
            newValue: productData.stock
        },
        priority: action === 'outOfStock' ? 'critical' : action === 'lowStock' ? 'high' : 'normal'
    });
};

// Crear actividad del sistema
activitySchema.statics.createSystemActivity = async function(title, description = '', userId = null, priority = 'normal') {
    const activityId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return this.create({
        activityId,
        type: 'system',
        icon: '⚙️',
        title,
        description,
        userId,
        priority
    });
};

// ===== MÉTODOS DE INSTANCIA =====

// Formatear tiempo relativo
activitySchema.methods.getRelativeTime = function() {
    const now = new Date();
    const diff = now - this.activityDate;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `Hace ${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `Hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    return 'Hace unos momentos';
};

// Formatear para el frontend
activitySchema.methods.toFrontend = function() {
    return {
        id: this.activityId,
        icon: this.icon,
        title: this.title,
        description: this.description,
        time: this.activityDate,
        type: this.type,
        amount: this.amount,
        status: this.metadata?.status,
        priority: this.priority,
        relativeTime: this.getRelativeTime(),
        metadata: this.metadata
    };
};

// ===== HOOKS/MIDDLEWARE =====

// Limpiar actividades antiguas automáticamente
activitySchema.statics.cleanOldActivities = async function(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    return this.deleteMany({
        createdAt: { $lt: cutoffDate },
        priority: { $in: ['low', 'normal'] }
    });
};

// Archivar actividades en lugar de eliminar
activitySchema.statics.archiveOldActivities = async function(daysToKeep = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    return this.updateMany(
        {
            createdAt: { $lt: cutoffDate },
            status: 'active'
        },
        {
            status: 'archived',
            isVisible: false
        }
    );
};

// ===== MODELO PARA CONFIGURACIÓN DEL DASHBOARD =====

const dashboardConfigSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    
    // Configuración de widgets
    widgets: {
        sales: {
            visible: { type: Boolean, default: true },
            position: { type: Number, default: 1 }
        },
        purchases: {
            visible: { type: Boolean, default: true },
            position: { type: Number, default: 2 }
        },
        activities: {
            visible: { type: Boolean, default: true },
            position: { type: Number, default: 3 },
            limit: { type: Number, default: 10, min: 5, max: 50 }
        },
        charts: {
            visible: { type: Boolean, default: true },
            position: { type: Number, default: 4 },
            defaultPeriod: { type: String, enum: ['today', 'week', 'month', 'year'], default: 'month' }
        }
    },
    
    // Preferencias de notificaciones
    notifications: {
        lowStock: { type: Boolean, default: true },
        newSales: { type: Boolean, default: true },
        newPurchases: { type: Boolean, default: true },
        systemAlerts: { type: Boolean, default: true }
    },
    
    // Configuración de refresh automático
    autoRefresh: {
        enabled: { type: Boolean, default: true },
        interval: { type: Number, default: 120000, min: 30000 } // en milisegundos
    },
    
    // Tema y apariencia
    appearance: {
        theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'light' },
        compactMode: { type: Boolean, default: false }
    }
}, {
    timestamps: true
});

// ===== EXPORTAR MODELOS =====

const DashboardActivity = mongoose.model('DashboardActivity', activitySchema);
const DashboardConfig = mongoose.model('DashboardConfig', dashboardConfigSchema);

export { DashboardActivity, DashboardConfig };
export default DashboardActivity;