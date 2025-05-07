import mongoose from "mongoose";
import Purchase from "../models/purchase.js";
import Product from "../models/product.js";
import Provider from "../models/provider.js";
import { checkPermission } from "../utils/permissions.js";
import { generatePdfReport, generateExcelReport } from "../utils/report-exporters.js";

async function generatePurchaseId() {
    const lastPurchase = await Purchase.findOne().sort({ createdAt: -1 });
    if (!lastPurchase || !/^Pu\d{2}$/.test(lastPurchase.id)) {
        return "Pu01";
    }

    const lastNumber = parseInt(lastPurchase.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Pu${nextNumber}`;
}

function validatePurchaseData(data, isUpdate = false) {
    const errors = [];
    
    if (!isUpdate) {
        if (!data.productos || !Array.isArray(data.productos) || data.productos.length === 0) {
            errors.push("Al menos un producto es requerido");
        }
        if (!data.proveedor) errors.push("El proveedor es requerido");
    }
    
    if (data.proveedor && !mongoose.Types.ObjectId.isValid(data.proveedor)) {
        errors.push("Formato de ID de proveedor inválido");
    }
    
    if (data.productos && Array.isArray(data.productos)) {
        data.productos.forEach((item, index) => {
            if (!item.producto || !mongoose.Types.ObjectId.isValid(item.producto)) {
                errors.push(`Producto inválido en la posición ${index}`);
            }
            if (typeof item.cantidad !== 'number' || item.cantidad <= 0) {
                errors.push(`Cantidad inválida en la posición ${index}`);
            }
            if (typeof item.precio_compra !== 'number' || item.precio_compra <= 0) {
                errors.push(`Precio de compra inválido en la posición ${index}`);
            }
        });
    }
    
    if (data.fecha_compra !== undefined) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
        if (!dateRegex.test(data.fecha_compra) && !(data.fecha_compra instanceof Date)) {
            errors.push("Formato de fecha inválido. Use YYYY-MM-DD o formato ISO");
        }
    }
    
    if (data.estado !== undefined && !["active", "inactive"].includes(data.estado)) {
        errors.push("El estado debe ser 'active' o 'inactive'");
    }
    
    return errors;
}

// GET: Obtener todas las compras
export const getPurchases = async (req, res) => {
    try {        
        if (!req.user || !checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "Acceso no autorizado" });
        }

        console.log("Ejecutando consulta de compras");
        const purchases = await Purchase.find()
            .populate("proveedor", "name")
            .populate("productos.producto", "name price");
        console.log(`Encontradas ${purchases.length} compras`);

        const formattedPurchases = purchases.map(purchase => {
            const purchaseObj = purchase.toObject();
            
            if (purchaseObj.fecha_compra) {
                purchaseObj.fecha_compra = new Date(purchaseObj.fecha_compra).toISOString().split('T')[0];
            }
            
            return purchaseObj;
        });

        res.status(200).json(formattedPurchases);
    } catch (error) {
        console.error("Error al obtener compras:", error);
        res.status(500).json({ message: "Error del servidor", details: error.message });
    }
};

// GET: Obtener una compra por ID
export const getPurchaseById = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "view_purchases_id")) {
            return res.status(403).json({ message: "Acceso no autorizado" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Formato de ID de compra inválido" });
        }

        const purchase = await Purchase.findById(id)
            .populate("proveedor", "name")
            .populate("productos.producto", "name price");

        if (!purchase) {
            return res.status(404).json({ message: "Compra no encontrada" });
        }

        const formattedPurchase = purchase.toObject();
        
        if (formattedPurchase.fecha_compra) {
            formattedPurchase.fecha_compra = new Date(formattedPurchase.fecha_compra).toISOString().split('T')[0];
        }

        res.status(200).json(formattedPurchase);
    } catch (error) {
        console.error("Error al obtener compra:", error);
        res.status(500).json({ message: "Error del servidor", details: error.message });
    }
};

// POST: Crear nueva compra
export const postPurchase = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_purchases")) {
            return res.status(403).json({ message: "Acceso no autorizado" });
        }

        const { productos, proveedor, fecha_compra, estado = "active" } = req.body;

        // Validación de datos
        const validationErrors = validatePurchaseData(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: "Error de validación", errors: validationErrors });
        }

        // Verificar proveedor
        const proveedorExistente = await Provider.findById(proveedor);
        if (!proveedorExistente) {
            return res.status(404).json({ message: "Proveedor no encontrado" });
        }

        // Procesar productos
        let total = 0;
        let productosValidados = [];

        for (let i = 0; i < productos.length; i++) {
            const item = productos[i];
            
            // Verificar producto
            const foundProduct = await Product.findById(item.producto);
            if (!foundProduct) {
                return res.status(404).json({ message: `Producto no encontrado en el índice ${i}` });
            }

            if (foundProduct.status !== "active") {
                return res.status(400).json({ message: `No se puede usar un producto inactivo en el índice ${i}` });
            }

            // Calcular total
            const itemTotal = item.precio_compra * item.cantidad;
            
            productosValidados.push({
                producto: item.producto,
                cantidad: item.cantidad,
                precio_compra: item.precio_compra,
                total: itemTotal
            });
            
            total += itemTotal;

            // Incrementar el stock del producto solo si el estado es active
            if (estado === "active") {
                await foundProduct.incrementStock(item.cantidad);
            }
        }

        // Generar ID único
        const id = await generatePurchaseId();

        // Crear nueva compra
        const newPurchase = new Purchase({
            id,
            proveedor,
            productos: productosValidados,
            fecha_compra: fecha_compra || new Date(),
            total,
            estado
        });

        await newPurchase.save();

        const formattedPurchase = newPurchase.toObject();
        
        if (formattedPurchase.fecha_compra) {
            formattedPurchase.fecha_compra = new Date(formattedPurchase.fecha_compra).toISOString().split('T')[0];
        }

        res.status(201).json({ 
            message: "Compra creada exitosamente y stock de productos actualizado", 
            purchase: formattedPurchase 
        });
    } catch (error) {
        console.error("Error al crear compra:", error);
        res.status(500).json({ message: "Error del servidor", details: error.message });
    }
};

// PUT: Actualizar una compra existente
export const updatePurchase = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_purchases")) {
            return res.status(403).json({ message: "Acceso no autorizado" });
        }

        const { id } = req.params;
        const { proveedor, fecha_compra, estado } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Formato de ID de compra inválido" });
        }

        // Validación de datos
        const validationErrors = validatePurchaseData(req.body, true);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: "Error de validación", errors: validationErrors });
        }

        // Obtener la compra actual para verificar si cambia el estado
        const currentPurchase = await Purchase.findById(id);
        if (!currentPurchase) {
            return res.status(404).json({ message: "Compra no encontrada" });
        }

        let updateFields = {};

        // Verificar los campos a actualizar
        if (proveedor) {
            const proveedorExistente = await Provider.findById(proveedor);
            if (!proveedorExistente) {
                return res.status(404).json({ message: "Proveedor no encontrado" });
            }
            updateFields.proveedor = proveedor;
        }

        if (fecha_compra !== undefined) updateFields.fecha_compra = fecha_compra;
        
        // Manejar cambio de estado y actualización de stock si es necesario
        if (estado !== undefined) {
            if (currentPurchase.estado !== estado) {
                // Si cambia de activo a inactivo
                if (currentPurchase.estado === "active" && estado === "inactive") {
                    for (const item of currentPurchase.productos) {
                        const product = await Product.findById(item.producto);
                        if (product) {
                            if (product.stock >= item.cantidad) {
                                await product.decrementStock(item.cantidad);
                            } else {
                                return res.status(400).json({
                                    message: "No se puede desactivar la compra porque el producto ya no tiene suficiente stock disponible",
                                    product: product.name
                                });
                            }
                        }
                    }
                } 
                // Si cambia de inactivo a activo
                else if (currentPurchase.estado === "inactive" && estado === "active") {
                    for (const item of currentPurchase.productos) {
                        const product = await Product.findById(item.producto);
                        if (product) {
                            await product.incrementStock(item.cantidad);
                        }
                    }
                }
            }
            updateFields.estado = estado;
        }
        
        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: "No hay campos válidos para actualizar" });
        }

        // No permitimos actualizar los productos para evitar inconsistencias en el stock
        const updatedPurchase = await Purchase.findByIdAndUpdate(id, updateFields, {
            new: true,
            runValidators: true
        })
            .populate("proveedor", "name")
            .populate("productos.producto", "name price");

        const formattedPurchase = updatedPurchase.toObject();
        
        if (formattedPurchase.fecha_compra) {
            formattedPurchase.fecha_compra = new Date(formattedPurchase.fecha_compra).toISOString().split('T')[0];
        }

        res.status(200).json({ message: "Compra actualizada exitosamente", purchase: formattedPurchase });
    } catch (error) {
        console.error("Error al actualizar compra:", error);
        
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: "Error de validación", errors });
        }
        
        res.status(500).json({ message: "Error del servidor", details: error.message });
    }
};

// Actualizar estado de compra
export const updatePurchaseStatus = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_status_purchases")) {
            return res.status(403).json({ message: "Acceso no autorizado" });
        }

        const { id } = req.params;
        const { estado } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Formato de ID de compra inválido" });
        }

        if (!estado || !["active", "inactive"].includes(estado)) {
            return res.status(400).json({ message: "El estado debe ser 'active' o 'inactive'" });
        }

        // Obtener la compra actual para verificar su estado previo
        const currentPurchase = await Purchase.findById(id);
        
        if (!currentPurchase) {
            return res.status(404).json({ message: "Compra no encontrada" });
        }
        
        // Solo actualizar el stock si el estado está cambiando
        if (currentPurchase.estado !== estado) {
            // Si está pasando de active a inactive, decrementar el stock
            if (currentPurchase.estado === "active" && estado === "inactive") {
                for (const item of currentPurchase.productos) {
                    const product = await Product.findById(item.producto);
                    if (product) {
                        if (product.stock >= item.cantidad) {
                            await product.decrementStock(item.cantidad);
                        } else {
                            return res.status(400).json({
                                message: "No se puede desactivar la compra porque el producto ya no tiene suficiente stock disponible",
                                product: product.name
                            });
                        }
                    }
                }
            } 
            // Si está pasando de inactive a active, incrementar el stock
            else if (currentPurchase.estado === "inactive" && estado === "active") {
                for (const item of currentPurchase.productos) {
                    const product = await Product.findById(item.producto);
                    if (product) {
                        await product.incrementStock(item.cantidad);
                    }
                }
            }
        }

        // Actualizar el estado de la compra
        const updatedPurchase = await Purchase.findByIdAndUpdate(
            id,
            { estado },
            { new: true, runValidators: true }
        )
            .populate("proveedor", "name")
            .populate("productos.producto", "name price");

        const formattedPurchase = updatedPurchase.toObject();
        
        if (formattedPurchase.fecha_compra) {
            formattedPurchase.fecha_compra = new Date(formattedPurchase.fecha_compra).toISOString().split('T')[0];
        }

        res.status(200).json({ 
            message: `Compra ${estado === 'active' ? 'activada' : 'desactivada'} exitosamente y stock actualizado`, 
            purchase: formattedPurchase 
        });
    } catch (error) {
        console.error("Error al actualizar estado de compra:", error);
        res.status(500).json({ message: "Error del servidor", details: error.message });
    }
};

// DELETE: Eliminar una compra por ID
export const deletePurchase = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "delete_purchases")) {
            return res.status(403).json({ message: "Acceso no autorizado" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Formato de ID de compra inválido" });
        }

        // Buscar la compra antes de eliminarla para actualizar el stock
        const purchaseToDelete = await Purchase.findById(id);
        
        if (!purchaseToDelete) {
            return res.status(404).json({ message: "Compra no encontrada" });
        }
        
        // Revertir los incrementos de stock realizados en la compra
        if (purchaseToDelete.estado === "active" && purchaseToDelete.productos && Array.isArray(purchaseToDelete.productos)) {
            for (const item of purchaseToDelete.productos) {
                const product = await Product.findById(item.producto);
                if (product) {
                    // Verificar que haya suficiente stock para decrementar
                    if (product.stock >= item.cantidad) {
                        await product.decrementStock(item.cantidad);
                    } else {
                        return res.status(400).json({ 
                            message: "No se puede eliminar la compra porque el producto ya no tiene suficiente stock disponible", 
                            product: product.name
                        });
                    }
                }
            }
        }

        // Eliminar la compra
        await Purchase.findByIdAndDelete(id);

        res.status(200).json({ message: "Compra eliminada exitosamente y stock actualizado" });
    } catch (error) {
        console.error("Error al eliminar compra:", error);
        res.status(500).json({ message: "Error del servidor", details: error.message });
    }
};

// Exportar compras a PDF
export const exportPurchaseToPdf = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "No tienes permiso para generar reportes" });
        }

        const { startDate, endDate, proveedorId, productoId, estado } = req.query;
        
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ 
                message: "La fecha de inicio no puede ser posterior a la fecha de fin" 
            });
        }
        
        // Construir consulta
        let query = {};
        
        if (startDate || endDate) {
            query.fecha_compra = {};
            if (startDate) query.fecha_compra.$gte = new Date(startDate);
            if (endDate) query.fecha_compra.$lte = new Date(endDate);
        }
        
        if (proveedorId && mongoose.Types.ObjectId.isValid(proveedorId)) {
            query.proveedor = proveedorId;
        }
        
        if (productoId && mongoose.Types.ObjectId.isValid(productoId)) {
            query["productos.producto"] = productoId;
        }
        
        // Filtro de estado
        if (estado && ["active", "inactive"].includes(estado)) {
            query.estado = estado;
        }

        // Obtener datos
        const purchases = await Purchase.find(query)
            .sort({ fecha_compra: -1 })
            .populate("proveedor", "name")
            .populate("productos.producto", "name price")
            .lean();
            
        if (purchases.length === 0) {
            return res.status(404).json({ 
                message: "No se encontraron compras con los criterios especificados" 
            });
        }

        const companyName = "IceSoft";
        let providerInfo = null;
        let productInfo = null;
        
        if (proveedorId && mongoose.Types.ObjectId.isValid(proveedorId)) {
            providerInfo = await Provider.findById(proveedorId).lean();
        }
        
        if (productoId && mongoose.Types.ObjectId.isValid(productoId)) {
            productInfo = await Product.findById(productoId).lean();
        }

        // Configurar headers para descarga de PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=purchases-report-${Date.now()}.pdf`);

        // Preparar opciones para el reporte PDF
        const reportOptions = {
            data: purchases,
            title: "Reporte de Compras",
            companyName: companyName,
            filters: {
                startDate,
                endDate,
                proveedor: providerInfo ? providerInfo.name : "Todos",
                producto: productInfo ? productInfo.name : "Todos",
                estado: estado || "Todos"
            },
            columns: [
                { header: "ID", key: "id", width: 80 },
                { header: "Fecha", key: "fecha_compra", width: 100, type: "date" },
                { header: "Proveedor", key: "proveedorName", width: 150 },
                { header: "Productos (Cantidad)", key: "productosDetalle", width: 200 },
                { header: "Total", key: "total", width: 120, align: "right", type: "currency" },
                { header: "Estado", key: "estado", width: 80 }
            ],
            formatData: (purchase) => {
                // Formatear productos con cantidades
                let productosDetalle = "Sin productos";
                if (purchase.productos && purchase.productos.length > 0) {
                    productosDetalle = purchase.productos.map(item => {
                        const productName = item.producto?.name || "Producto desconocido";
                        return `${productName} (${item.cantidad})`;
                    }).join(", ");
                }
                
                // Formatear datos de cada fila
                return {
                    id: purchase.id || purchase._id?.toString().substring(0, 8) || "N/A",
                    fecha_compra: purchase.fecha_compra ? new Date(purchase.fecha_compra) : null,
                    proveedorName: purchase.proveedor?.name || "Desconocido",
                    productosDetalle: productosDetalle,
                    total: purchase.total || 0,
                    estado: purchase.estado || "N/A"
                };
            },
            calculateSummary: (data) => {
                // Calcular información de resumen
                const totalAmount = data.reduce((sum, purchase) => sum + (purchase.total || 0), 0);
                return {
                    count: data.length,
                    totalAmount
                };
            },
            filename: `purchases-report-${Date.now()}.pdf`
        };
        
        try {
            await generatePdfReport(reportOptions, res);
        } catch (pdfError) {
            console.error("Error al generar PDF:", pdfError);
            
            if (!res.headersSent) {
                return res.status(500).json({ 
                    message: "Error al generar reporte PDF", 
                    error: pdfError.message 
                });
            }
        }
        
    } catch (error) {
        console.error("Error al generar reporte PDF:", error);
        
        if (!res.headersSent) {
            return res.status(500).json({ 
                message: "Error al generar reporte PDF", 
                error: error.message
            });
        }
    }
};

// Exportar compras a Excel
export const exportPurchaseToExcel = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "No tienes permiso para generar reportes" });
        }

        const { startDate, endDate, proveedorId, productoId, estado } = req.query;
        
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ 
                message: "La fecha de inicio no puede ser posterior a la fecha de fin" 
            });
        }
        
        // Construir consulta
        let query = {};
        
        if (startDate || endDate) {
            query.fecha_compra = {};
            if (startDate) query.fecha_compra.$gte = new Date(startDate);
            if (endDate) query.fecha_compra.$lte = new Date(endDate);
        }
        
        if (proveedorId && mongoose.Types.ObjectId.isValid(proveedorId)) {
            query.proveedor = proveedorId;
        }
        
        if (productoId && mongoose.Types.ObjectId.isValid(productoId)) {
            query["productos.producto"] = productoId;
        }
        
        // Filtro de estado
        if (estado && ["active", "inactive"].includes(estado)) {
            query.estado = estado;
        }

        // Obtener datos
        const purchases = await Purchase.find(query)
            .sort({ fecha_compra: -1 })
            .populate("proveedor", "name")
            .populate("productos.producto", "name price")
            .lean();
            
        if (purchases.length === 0) {
            return res.status(404).json({ 
                message: "No se encontraron compras con los criterios especificados" 
            });
        }

        const companyName = "IceSoft";
        let providerInfo = null;
        let productInfo = null;
        
        if (proveedorId && mongoose.Types.ObjectId.isValid(proveedorId)) {
            providerInfo = await Provider.findById(proveedorId).lean();
        }
        
        if (productoId && mongoose.Types.ObjectId.isValid(productoId)) {
            productInfo = await Product.findById(productoId).lean();
        }

        // Configurar headers para descarga de Excel
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=purchases-report-${Date.now()}.xlsx`);

        // Preparar opciones para el reporte Excel
        const reportOptions = {
            data: purchases,
            title: "Reporte de Compras",
            companyName: companyName,
            filters: {
                startDate,
                endDate,
                proveedor: providerInfo ? providerInfo.name : "Todos",
                producto: productInfo ? productInfo.name : "Todos",
                estado: estado || "Todos"
            },
            columns: [
                { header: "ID", key: "id", width: 15 },
                { header: "Fecha", key: "fecha_compra", width: 15, type: "date" },
                { header: "Proveedor", key: "proveedorName", width: 30 },
                { header: "Productos (Cantidad)", key: "productosDetalle", width: 50 },
                { header: "Total", key: "total", width: 20, align: "right", type: "currency" },
                { header: "Estado", key: "estado", width: 15 }
            ],
            formatData: (purchase) => {
                // Formatear productos con cantidades
                let productosDetalle = "Sin productos";
                if (purchase.productos && purchase.productos.length > 0) {
                    productosDetalle = purchase.productos.map(item => {
                        const productName = item.producto?.name || "Producto desconocido";
                        return `${productName} (${item.cantidad})`;
                    }).join(", ");
                }
                
                // Formatear datos de cada fila
                return {
                    id: purchase.id || purchase._id?.toString().substring(0, 8) || "N/A",
                    fecha_compra: purchase.fecha_compra ? new Date(purchase.fecha_compra) : null,
                    proveedorName: purchase.proveedor?.name || "Desconocido",
                    productosDetalle: productosDetalle,
                    total: purchase.total || 0,
                    estado: purchase.estado || "N/A"
                };
            },
            calculateSummary: (data) => {
                // Calcular información de resumen
                const totalAmount = data.reduce((sum, purchase) => sum + (purchase.total || 0), 0);
                return {
                    count: data.length,
                    totalAmount
                };
            },
            filename: `purchases-report-${Date.now()}.xlsx`
        };
        
        try {
            await generateExcelReport(reportOptions, res);
            console.log("Archivo Excel generado y enviado exitosamente");
        } catch (excelError) {
            console.error("Error al generar archivo Excel:", excelError);
            
            if (!res.headersSent) {
                return res.status(500).json({ 
                    message: "Error al generar reporte Excel", 
                    error: excelError.message 
                });
            }
        }
        
    } catch (error) {
        console.error("Error al generar reporte Excel:", error);
        
        if (!res.headersSent) {
            return res.status(500).json({ 
                message: "Error al generar reporte Excel", 
                error: error.message
            });
        }
    }
};