import mongoose from "mongoose";
import Purchase from "../models/purchase.js";
import Product from "../models/product.js";
import Provider from "../models/provider.js";
import { checkPermission } from "../utils/permissions.js";

async function generatePurchaseId() {
    const lastPurchase = await Purchase.findOne().sort({ createdAt: -1 });
    if (!lastPurchase || !/^Pu\d{2}$/.test(lastPurchase.id)) {
        return "Pu01";
    }

    const lastNumber = parseInt(lastPurchase.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Pu${nextNumber}`;
}

function validatePurchaseData(data) {
    const errors = [];
    
    // Validaciones obligatorias para creación
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

// GET: Retrieve all purchases
export const getPurchases = async (req, res) => {
    try {        
        if (!req.user || !checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        console.log("Executing purchase query");
        const purchases = await Purchase.find()
            .populate("provider", "company")
            .populate("products.product", "name price");
        console.log(`Found ${purchases.length} purchases`);

        const formattedPurchases = purchases.map(purchase => {
            const purchaseObj = purchase.toObject();
            
            if (purchaseObj.purchase_date) {
                purchaseObj.purchase_date = new Date(purchaseObj.purchase_date).toISOString().split('T')[0];
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
        console.error("Error fetching purchases:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// GET: Retrieve a single purchase by ID
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
            formattedPurchase.purchase_date = new Date(formattedPurchase.purchase_date).toISOString().split('T')[0];
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
        console.error("Error fetching purchase:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// POST: Create new purchase
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

        const id = await generatePurchaseId();

        const newPurchase = new Purchase({
            id,
            provider,
            products: validatedProducts,
            purchase_date: purchase_date || new Date(),
            total
        });

        await newPurchase.save();

        const formattedPurchase = newPurchase.toObject();
        
        if (formattedPurchase.purchase_date) {
            formattedPurchase.purchase_date = new Date(formattedPurchase.purchase_date).toISOString().split('T')[0];
        }

        res.status(201).json({ 
            message: "Purchase created successfully and product stock updated", 
            purchase: formattedPurchase 
        });
    } catch (error) {
        console.error("Error creating purchase:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// UPDATE: Deactivate purchase (one-way only)
export const deactivatePurchase = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_status_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        const purchase = await Purchase.findById(id);
        
        if (!purchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }

        if (purchase.status !== "active") {
            return res.status(400).json({ 
                message: "Purchase is already inactive or cannot be deactivated" 
            });
        }

        // Verificar que hay suficiente stock para revertir
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

        // Revertir el stock
        for (const item of purchase.products) {
            const product = await Product.findById(item.product);
            if (product) {
                await product.decrementStock(item.quantity);
            }
        }

        const updatedPurchase = await Purchase.findByIdAndUpdate(
            id,
            { status: "inactive" },
            { new: true, runValidators: true }
        )
            .populate("provider", "company")
            .populate("products.product", "name price");

        const formattedPurchase = updatedPurchase.toObject();
        
        if (formattedPurchase.purchase_date) {
            formattedPurchase.purchase_date = new Date(formattedPurchase.purchase_date).toISOString().split('T')[0];
        }

        res.status(200).json({ 
            message: "Purchase deactivated successfully and stock reverted", 
            purchase: formattedPurchase 
        });
    } catch (error) {
        console.error("Error deactivating purchase:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// DELETE: Remove a purchase by ID (solo si está inactiva)
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
        console.error("Error deleting purchase:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};