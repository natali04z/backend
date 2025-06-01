import Product from "../models/product.js";
import Category from "../models/category.js";
import mongoose from "mongoose";
import { checkPermission } from "../utils/permissions.js";

async function generateProductId() {
    const lastProduct = await Product.findOne().sort({ _id: -1 });

    if (!lastProduct || !/^Pr\d{2}$/.test(lastProduct.id)) {
        return "Pr01";
    }

    const lastNumber = parseInt(lastProduct.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Pr${nextNumber}`;
}

function calculateDaysUntilExpiration(expirationDate) {
    if (!expirationDate) return null;
    
    const currentDate = new Date();
    const expiration = new Date(expirationDate);
    
    currentDate.setHours(0, 0, 0, 0);
    expiration.setHours(0, 0, 0, 0);
    
    const timeDiff = expiration - currentDate;
    return Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
}

function formatDateForResponse(date) {
    if (!date) return null;
    return date.toISOString();
}

export const validateProductForSale = async (productId) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return {
                isValid: false,
                message: "ID de producto inválido"
            };
        }

        const product = await Product.findById(productId);

        if (!product) {
            return {
                isValid: false,
                message: "Producto no encontrado"
            };
        }

        if (product.status !== "active") {
            return {
                isValid: false,
                message: "El producto está inactivo y no puede ser vendido"
            };
        }

        if (product.stock <= 0) {
            return {
                isValid: false,
                message: "Producto sin stock disponible"
            };
        }

        return {
            isValid: true,
            product: product
        };
    } catch (error) {
        console.error("Error validating product for sale:", error);
        return {
            isValid: false,
            message: "Error interno del servidor"
        };
    }
};

export const checkExpiringProducts = async (daysBeforeExpiration = 7) => {
    try {
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);
        
        const alertDate = new Date();
        alertDate.setDate(currentDate.getDate() + daysBeforeExpiration);
        alertDate.setHours(23, 59, 59, 999);
        
        const pastDate = new Date();
        pastDate.setDate(currentDate.getDate() - 30);
        
        const expiringProducts = await Product.find({
            status: "active",
            expirationDate: {
                $gte: pastDate,
                $lte: alertDate
            }
        })
        .select("id name expirationDate stock category")
        .populate("category", "name")
        .sort({ expirationDate: 1 });

        const relevantProducts = expiringProducts.filter(product => {
            const daysUntilExpiration = calculateDaysUntilExpiration(product.expirationDate);
            return daysUntilExpiration <= daysBeforeExpiration;
        });

        return relevantProducts.map(product => {
            const daysUntilExpiration = calculateDaysUntilExpiration(product.expirationDate);
            return {
                id: product.id,
                name: product.name,
                expirationDate: formatDateForResponse(product.expirationDate),
                stock: product.stock,
                category: product.category?.name,
                daysUntilExpiration: daysUntilExpiration
            };
        });
    } catch (error) {
        console.error("Error checking expiring products:", error);
        return [];
    }
};

export const getExpirationNotifications = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const daysBeforeExpiration = req.query.days ? parseInt(req.query.days) : 7;
        
        if (daysBeforeExpiration < 1 || daysBeforeExpiration > 365) {
            return res.status(400).json({ 
                message: "Invalid days parameter. Must be between 1 and 365" 
            });
        }
        
        const expiringProducts = await checkExpiringProducts(daysBeforeExpiration);

        const expiredProducts = expiringProducts.filter(p => p.daysUntilExpiration <= 0);
        const urgentProducts = expiringProducts.filter(p => p.daysUntilExpiration > 0 && p.daysUntilExpiration <= 3);
        const soonProducts = expiringProducts.filter(p => p.daysUntilExpiration > 3 && p.daysUntilExpiration <= daysBeforeExpiration);

        let message = "";
        if (expiredProducts.length > 0) {
            message += `${expiredProducts.length} producto(s) vencido(s). `;
        }
        if (urgentProducts.length > 0) {
            message += `${urgentProducts.length} producto(s) vence(n) en 3 días o menos. `;
        }
        if (soonProducts.length > 0) {
            message += `${soonProducts.length} producto(s) vence(n) en los próximos ${daysBeforeExpiration} días.`;
        }
        
        if (expiringProducts.length === 0) {
            message = `No hay productos próximos a vencer en los próximos ${daysBeforeExpiration} días.`;
        }

        res.status(200).json({
            message: message.trim(),
            count: expiringProducts.length,
            products: expiringProducts,
            summary: {
                expired: expiredProducts.length,
                urgent: urgentProducts.length,
                soon: soonProducts.length,
                total: expiringProducts.length
            }
        });
    } catch (error) {
        console.error("Error getting expiration notifications:", error);
        res.status(500).json({ 
            message: "Server error", 
            details: error.message 
        });
    }
};

// Get all products
export const getProducts = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const products = await Product.find()
            .select("id name price stock status category batchDate expirationDate formattedPrice")
            .populate("category", "name");

        const productsWithDays = products.map(product => {
            try {
                const productObj = product.toObject();
                productObj.daysUntilExpiration = calculateDaysUntilExpiration(product.expirationDate);
                
                // Formatear fechas solo si existen
                if (product.batchDate) {
                    productObj.batchDate = formatDateForResponse(product.batchDate);
                }
                if (product.expirationDate) {
                    productObj.expirationDate = formatDateForResponse(product.expirationDate);
                }
                
                return productObj;
            } catch (error) {
                console.error("Error processing product:", product.id, error);
                // Retornar producto original si hay error
                return product.toObject();
            }
        });

        // Obtener productos próximos a vencer de forma segura
        let expiringProductsAlert = null;
        try {
            const expiringProducts = await checkExpiringProducts(7);
            if (expiringProducts.length > 0) {
                expiringProductsAlert = {
                    message: `Tienes ${expiringProducts.length} producto(s) próximo(s) a vencer en 1 semana`,
                    count: expiringProducts.length
                };
            }
        } catch (error) {
            console.error("Error checking expiring products:", error);
        }
        
        res.status(200).json({
            products: productsWithDays,
            expiringProductsAlert: expiringProductsAlert
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Get product by ID
export const getProductById = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_products_id")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        const product = await Product.findById(id)
            .select("id name price stock status category batchDate expirationDate formattedPrice")
            .populate("category", "name");

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        const daysUntilExpiration = calculateDaysUntilExpiration(product.expirationDate);
        
        const response = {
            ...product.toObject(),
            daysUntilExpiration: daysUntilExpiration,
            expirationAlert: daysUntilExpiration <= 7 && daysUntilExpiration > 0 ? {
                message: `Este producto vence en ${daysUntilExpiration} día(s)`,
                daysUntilExpiration
            } : null
        };

        // Formatear fechas solo si existen
        if (product.batchDate) {
            response.batchDate = formatDateForResponse(product.batchDate);
        }
        if (product.expirationDate) {
            response.expirationDate = formatDateForResponse(product.expirationDate);
        }

        res.status(200).json(response);
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Create product
export const postProduct = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { name, category, price, batchDate, expirationDate } = req.body;
        const initialStock = 0;
        
        if (!name || !category || price === undefined || !batchDate || !expirationDate) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (!mongoose.Types.ObjectId.isValid(category)) {
            return res.status(400).json({ message: "Invalid category ID" });
        }

        const existingCategory = await Category.findById(category);
        if (!existingCategory) {
            return res.status(404).json({ message: "Category not found" });
        }

        if (existingCategory.status !== "active") {
            return res.status(400).json({ message: "Cannot use inactive category" });
        }

        if (typeof price !== "number" || price <= 0) {
            return res.status(400).json({ message: "Price must be a positive number" });
        }
        
        if (!Number.isInteger(price)) {
            return res.status(400).json({ message: "Price must be an integer" });
        }
        
        const batchDateObj = new Date(batchDate);
        const expirationDateObj = new Date(expirationDate);
        
        if (isNaN(batchDateObj.getTime())) {
            return res.status(400).json({ message: "Batch date is invalid" });
        }
        
        if (isNaN(expirationDateObj.getTime())) {
            return res.status(400).json({ message: "Expiration date is invalid" });
        }
        
        if (batchDateObj > expirationDateObj) {
            return res.status(400).json({ message: "Expiration date must be after batch date" });
        }

        const daysUntilExpiration = calculateDaysUntilExpiration(expirationDateObj);
        
        const id = await generateProductId();
        const newProduct = new Product({
            id,
            name,
            category,
            price,
            batchDate: batchDateObj,
            expirationDate: expirationDateObj,
            stock: initialStock
        });

        await newProduct.save();
        
        const savedProduct = await Product.findById(newProduct._id)
            .select("id name price stock status category batchDate expirationDate formattedPrice")
            .populate("category", "name");
        
        const productResponse = {
            ...savedProduct.toObject(),
            daysUntilExpiration: daysUntilExpiration
        };
        
        // Formatear fechas solo si existen
        if (savedProduct.batchDate) {
            productResponse.batchDate = formatDateForResponse(savedProduct.batchDate);
        }
        if (savedProduct.expirationDate) {
            productResponse.expirationDate = formatDateForResponse(savedProduct.expirationDate);
        }
        
        const response = { 
            message: "Product created successfully. Stock starts at 0 and will increase with purchases.", 
            product: productResponse
        };

        if (daysUntilExpiration <= 7 && daysUntilExpiration > 0) {
            response.expirationAlert = {
                message: `Advertencia: Este producto vence en ${daysUntilExpiration} día(s)`,
                daysUntilExpiration
            };
        }
        
        res.status(201).json(response);
    } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update product
export const updateProduct = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "edit_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { name, category, price, batchDate, expirationDate } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        let categoryId = null;
        if (category) {
            if (!mongoose.Types.ObjectId.isValid(category)) {
                return res.status(400).json({ message: "Invalid category ID" });
            }
            
            const existingCategory = await Category.findById(category);
            if (!existingCategory) {
                return res.status(404).json({ message: "Category not found" });
            }
            
            if (existingCategory.status !== "active") {
                return res.status(400).json({ message: "Cannot use inactive category" });
            }
            
            categoryId = existingCategory._id;
        }
        
        if (price !== undefined) {
            if (typeof price !== "number" || price <= 0) {
                return res.status(400).json({ message: "Price must be a positive number" });
            }
            
            if (!Number.isInteger(price)) {
                return res.status(400).json({ message: "Price must be an integer" });
            }
        }
        
        let batchDateObj, expirationDateObj;
        
        if (batchDate) {
            batchDateObj = new Date(batchDate);
            if (isNaN(batchDateObj.getTime())) {
                return res.status(400).json({ message: "Batch date is invalid" });
            }
        }
        
        if (expirationDate) {
            expirationDateObj = new Date(expirationDate);
            if (isNaN(expirationDateObj.getTime())) {
                return res.status(400).json({ message: "Expiration date is invalid" });
            }
        }
        
        const finalBatchDate = batchDateObj || existingProduct.batchDate;
        const finalExpirationDate = expirationDateObj || existingProduct.expirationDate;
        
        if (batchDateObj || expirationDateObj) {
            if (finalBatchDate > finalExpirationDate) {
                return res.status(400).json({ message: "Expiration date must be after batch date" });
            }
        }
        
        const updateData = {};
        if (name) updateData.name = name;
        if (categoryId) updateData.category = categoryId;
        if (price !== undefined) updateData.price = price;
        if (batchDateObj) updateData.batchDate = batchDateObj;
        if (expirationDateObj) updateData.expirationDate = expirationDateObj;

        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        )
            .select("id name price stock status category batchDate expirationDate formattedPrice")
            .populate("category", "name");

        const daysUntilExpiration = calculateDaysUntilExpiration(updatedProduct.expirationDate);
        
        const productResponse = {
            ...updatedProduct.toObject(),
            daysUntilExpiration: daysUntilExpiration
        };
        
        // Formatear fechas solo si existen
        if (updatedProduct.batchDate) {
            productResponse.batchDate = formatDateForResponse(updatedProduct.batchDate);
        }
        if (updatedProduct.expirationDate) {
            productResponse.expirationDate = formatDateForResponse(updatedProduct.expirationDate);
        }
        
        const response = { 
            message: "Product updated successfully", 
            product: productResponse
        };

        if (daysUntilExpiration <= 7 && daysUntilExpiration > 0) {
            response.expirationAlert = {
                message: `Advertencia: Este producto vence en ${daysUntilExpiration} día(s)`,
                daysUntilExpiration
            };
        }

        res.status(200).json(response);
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update product status
export const updateProductStatus = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_status_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        if (!status || !["active", "inactive"].includes(status)) {
            return res.status(400).json({ message: "Status must be 'active' or 'inactive'" });
        }

        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            { status },
            { 
                new: true, 
                runValidators: true,
                useFindAndModify: false 
            }
        )
            .select("id name price stock status category batchDate expirationDate formattedPrice")
            .populate("category", "name");

        if (!updatedProduct) {
            return res.status(404).json({ message: "Product not found after update" });
        }

        const productResponse = {
            ...updatedProduct.toObject(),
            daysUntilExpiration: calculateDaysUntilExpiration(updatedProduct.expirationDate)
        };

        // Formatear fechas solo si existen
        if (updatedProduct.batchDate) {
            productResponse.batchDate = formatDateForResponse(updatedProduct.batchDate);
        }
        if (updatedProduct.expirationDate) {
            productResponse.expirationDate = formatDateForResponse(updatedProduct.expirationDate);
        }

        const response = { 
            message: `Product ${status === 'active' ? 'activated' : 'deactivated'} successfully`, 
            product: productResponse
        };

        if (status === 'inactive') {
            response.warning = "El producto ha sido desactivado y no podrá ser vendido hasta que se reactive";
        }

        res.status(200).json(response);
    } catch (error) {
        console.error("Error updating product status:", error);
        res.status(500).json({ 
            message: "Server error", 
            error: error.message
        });
    }
};

// Delete product
export const deleteProduct = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "delete_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        const deletedProduct = await Product.findByIdAndDelete(id);

        if (!deletedProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        res.status(200).json({ message: "Product deleted successfully" });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ message: "Server error" });
    }
};