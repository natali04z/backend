import mongoose from "mongoose";
import Purchase from "../models/purchase.js";
import Product from "../models/product.js";
import Provider from "../models/provider.js";
import { checkPermission } from "../utils/permissions.js";

// ===== FUNCIONES HELPER PARA FECHAS =====

/**
 * Convierte una fecha a formato YYYY-MM-DD respetando la zona horaria local
 * @param {Date|string} date - Fecha a convertir
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
function formatLocalDate(date = new Date()) {
    const dateObj = date instanceof Date ? date : new Date(date);
    
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

/**
 * Convierte fecha de string YYYY-MM-DD a objeto Date (zona local)
 * @param {string} dateString
 * @returns {Date}
 */
function parseLocalDate(dateString) {
    if (!dateString) return new Date();
    
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    }
    
    return new Date(dateString);
}

async function generatePurchaseId() {
    try {
        const lastPurchase = await Purchase.findOne()
            .sort({ id: -1 })
            .select('id');
            
        if (!lastPurchase || !lastPurchase.id || !/^Pu\d{2}$/.test(lastPurchase.id)) {
            const existingPu01 = await Purchase.findOne({ id: "Pu01" });
            if (existingPu01) {
                return await findNextAvailableId();
            }
            return "Pu01";
        }

        const lastNumber = parseInt(lastPurchase.id.substring(2), 10);
        let nextNumber = lastNumber + 1;
        let attempts = 0;
        const maxAttempts = 100;
        
        while (attempts < maxAttempts) {
            const candidateId = `Pu${String(nextNumber).padStart(2, "0")}`;
            
            const existing = await Purchase.findOne({ id: candidateId });
            
            if (!existing) {
                return candidateId;
            }
            
            nextNumber++;
            attempts++;
        }
        
        const timestamp = Date.now().toString().slice(-4);
        return `Pu${timestamp}`;
        
    } catch (error) {
        const emergencyId = `Pu${Date.now().toString().slice(-4)}`;
        return emergencyId;
    }
}

async function findNextAvailableId() {
    for (let i = 1; i <= 99; i++) {
        const candidateId = `Pu${String(i).padStart(2, "0")}`;
        const existing = await Purchase.findOne({ id: candidateId });
        
        if (!existing) {
            return candidateId;
        }
    }
    
    // Si todos los números del 01 al 99 están ocupados
    const timestamp = Date.now().toString().slice(-4);
    return `Pu${timestamp}`;
}

function validatePurchaseData(data) {
    const errors = [];
    
    if (!data.products || !Array.isArray(data.products) || data.products.length === 0) {
        errors.push("At least one product is required");
    }
    if (!data.provider) errors.push("Provider is required");
    
    if (data.provider && !mongoose.Types.ObjectId.isValid(data.provider)) {
        errors.push("Invalid provider ID format");
    }
    
    if (data.products && Array.isArray(data.products)) {
        data.products.forEach((item, index) => {
            if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
                errors.push(`Invalid product at index ${index}`);
            }
            if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
                errors.push(`Invalid quantity at index ${index}. Must be a positive integer`);
            }
            if (typeof item.purchase_price !== 'number' || item.purchase_price <= 0) {
                errors.push(`Invalid purchase price at index ${index}. Must be a positive number`);
            }
        });
    }
    
    if (data.purchase_date !== undefined) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
        if (!dateRegex.test(data.purchase_date) && !(data.purchase_date instanceof Date)) {
            errors.push("Invalid date format. Use YYYY-MM-DD or ISO format");
        }
    }
    
    return errors;
}

// Retrieve all purchases
export const getPurchases = async (req, res) => {
    try {        
        if (!req.user || !checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const purchases = await Purchase.find()
            .populate("provider", "company")
            .populate("products.product", "name price");

        const formattedPurchases = purchases.map(purchase => {
            const purchaseObj = purchase.toObject();
            
            if (purchaseObj.purchase_date) {
                purchaseObj.purchase_date = formatLocalDate(purchaseObj.purchase_date);
            }
            
            if (purchaseObj.products && Array.isArray(purchaseObj.products)) {
                purchaseObj.products = purchaseObj.products.map(item => {
                    return {
                        ...item,
                        quantity: item.quantity || 0
                    };
                });
            }
            
            return purchaseObj;
        });

        res.status(200).json(formattedPurchases);
    } catch (error) {
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Retrieve a single purchase by ID
export const getPurchaseById = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "view_purchases_id")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        const purchase = await Purchase.findById(id)
            .populate("provider", "company")
            .populate("products.product", "name price");

        if (!purchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }

        const formattedPurchase = purchase.toObject();
        
        if (formattedPurchase.purchase_date) {
            formattedPurchase.purchase_date = formatLocalDate(formattedPurchase.purchase_date);
        }
        
        if (formattedPurchase.products && Array.isArray(formattedPurchase.products)) {
            formattedPurchase.products = formattedPurchase.products.map(item => {
                return {
                    ...item,
                    quantity: item.quantity || 0
                };
            });
        }

        res.status(200).json(formattedPurchase);
    } catch (error) {
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Create new purchase
export const postPurchase = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { products, provider, purchase_date } = req.body;

        const validationErrors = validatePurchaseData(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: "Validation error", errors: validationErrors });
        }

        const existingProvider = await Provider.findById(provider);
        if (!existingProvider) {
            return res.status(404).json({ message: "Provider not found" });
        }

        if (existingProvider.status !== "active") {
            return res.status(400).json({ message: "Cannot use inactive provider" });
        }

        let total = 0;
        let validatedProducts = [];

        for (let i = 0; i < products.length; i++) {
            const item = products[i];
            
            const foundProduct = await Product.findById(item.product);
            if (!foundProduct) {
                return res.status(404).json({ message: `Product not found at index ${i}` });
            }

            if (foundProduct.status !== "active") {
                return res.status(400).json({ message: `Cannot use inactive product at index ${i}` });
            }

            const itemTotal = item.purchase_price * item.quantity;
            
            validatedProducts.push({
                product: item.product,
                quantity: item.quantity,
                purchase_price: item.purchase_price,
                total: itemTotal
            });
            
            total += itemTotal;
            await foundProduct.incrementStock(item.quantity);
        }

        const purchaseId = await generatePurchaseId();

        const purchaseDate = purchase_date ? parseLocalDate(purchase_date) : new Date();

        const newPurchase = new Purchase({
            id: purchaseId,
            provider,
            products: validatedProducts,
            purchase_date: purchaseDate,
            total
        });

        await newPurchase.save();

        const formattedPurchase = newPurchase.toObject();
        
        if (formattedPurchase.purchase_date) {
            formattedPurchase.purchase_date = formatLocalDate(formattedPurchase.purchase_date);
        }

        res.status(201).json({ 
            message: "Purchase created successfully and product stock updated", 
            purchase: formattedPurchase 
        });
        
    } catch (error) {
        if (error.code === 11000 && error.keyPattern?.id) {
            return res.status(409).json({ 
                message: "Purchase ID conflict, please try again"
            });
        }
        
        res.status(500).json({ 
            message: "Server error", 
            details: error.message 
        });
    }
};

// Deactivate purchase (with reason)
export const deactivatePurchase = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_status_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { reason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        if (!reason || reason.trim().length === 0) {
            return res.status(400).json({ 
                message: "Deactivation reason is required" 
            });
        }

        const purchase = await Purchase.findById(id);
        
        if (!purchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }

        if (purchase.status !== "active") {
            return res.status(400).json({ 
                message: "Purchase is already inactive" 
            });
        }

        for (const item of purchase.products) {
            const product = await Product.findById(item.product);
            if (product) {
                if (product.stock < item.quantity) {
                    return res.status(400).json({
                        message: `Cannot deactivate purchase. Product '${product.name}' doesn't have sufficient stock to reverse the purchase`,
                        requiredStock: item.quantity,
                        availableStock: product.stock
                    });
                }
            }
        }

        for (const item of purchase.products) {
            const product = await Product.findById(item.product);
            if (product) {
                await product.decrementStock(item.quantity);
            }
        }

        const updatedPurchase = await Purchase.findByIdAndUpdate(
            id,
            { 
                status: "inactive",
                deactivation_reason: reason.trim(),
                deactivated_at: new Date(),
                deactivated_by: req.user.id
            },
            { new: true, runValidators: true }
        )
            .populate("provider", "company")
            .populate("products.product", "name price");

        const formattedPurchase = updatedPurchase.toObject();
        
        if (formattedPurchase.purchase_date) {
            formattedPurchase.purchase_date = formatLocalDate(formattedPurchase.purchase_date);
        }

        res.status(200).json({ 
            message: "Purchase deactivated successfully and stock reverted", 
            purchase: formattedPurchase 
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Reactivate purchase (with reason)
export const reactivatePurchase = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "reactivate_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { reason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        if (!reason || reason.trim().length === 0) {
            return res.status(400).json({ 
                message: "Reactivation reason is required" 
            });
        }

        const purchase = await Purchase.findById(id);
        
        if (!purchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }

        if (purchase.status !== "inactive") {
            return res.status(400).json({ 
                message: "Purchase is already active" 
            });
        }

        // Verificar que el proveedor esté activo
        const provider = await Provider.findById(purchase.provider);
        if (!provider || provider.status !== "active") {
            return res.status(400).json({
                message: "Cannot reactivate purchase. Provider is inactive or not found"
            });
        }

        // Verificar que todos los productos estén activos
        for (const item of purchase.products) {
            const product = await Product.findById(item.product);
            if (!product || product.status !== "active") {
                return res.status(400).json({
                    message: `Cannot reactivate purchase. Product is inactive or not found`
                });
            }
        }

        // Incrementar stock de productos
        for (const item of purchase.products) {
            const product = await Product.findById(item.product);
            if (product) {
                await product.incrementStock(item.quantity);
            }
        }

        const updatedPurchase = await Purchase.findByIdAndUpdate(
            id,
            { 
                status: "active",
                reactivation_reason: reason.trim(),
                reactivated_at: new Date(),
                reactivated_by: req.user.id
            },
            { new: true, runValidators: true }
        )
            .populate("provider", "company")
            .populate("products.product", "name price");

        const formattedPurchase = updatedPurchase.toObject();
        
        if (formattedPurchase.purchase_date) {
            formattedPurchase.purchase_date = formatLocalDate(formattedPurchase.purchase_date);
        }

        res.status(200).json({ 
            message: "Purchase reactivated successfully and stock restored", 
            purchase: formattedPurchase 
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Remove a purchase by ID (solo si está inactiva)
export const deletePurchase = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "delete_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        const purchaseToDelete = await Purchase.findById(id);
        
        if (!purchaseToDelete) {
            return res.status(404).json({ message: "Purchase not found" });
        }

        if (purchaseToDelete.status === "active") {
            return res.status(400).json({ 
                message: "Cannot delete an active purchase. Please deactivate it first." 
            });
        }

        await Purchase.findByIdAndDelete(id);

        res.status(200).json({ message: "Purchase deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", details: error.message });
    }
};