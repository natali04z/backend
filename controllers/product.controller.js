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
    
    // Verificar si ya es una instancia de Date
    let dateObj;
    if (date instanceof Date) {
        dateObj = date;
    } else {
        // Intentar convertir a Date
        dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) {
            return null;
        }
    }
    
    return dateObj.toISOString();
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

// Get all products
export const getProducts = async (req, res) => {
    try {
        console.log("🔍 getProducts iniciado");
        console.log("Usuario:", req.user);
        
        if (!checkPermission(req.user.role, "view_products")) {
            console.log("❌ Sin permisos para ver productos");
            return res.status(403).json({ message: "Unauthorized access" });
        }

        console.log("🔍 Consultando productos en BD...");
        const products = await Product.find()
            .select("id name price stock status category batchDate expirationDate formattedPrice")
            .populate("category", "name");

        console.log("✅ Productos encontrados:", products.length);

        const productsWithDays = products.map(product => {
            const productObj = product.toObject();
            productObj.daysUntilExpiration = calculateDaysUntilExpiration(product.expirationDate);
            return productObj;
        });

        // Calcular productos próximos a vencer (opcional, sin función externa)
        const currentDate = new Date();
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(currentDate.getDate() + 7);

        const expiringProducts = products.filter(product => {
            if (!product.expirationDate) return false;
            const expDate = new Date(product.expirationDate);
            return expDate >= currentDate && expDate <= sevenDaysFromNow && product.status === "active";
        });
        
        const response = {
            products: productsWithDays
        };

        // Agregar alerta solo si hay productos próximos a vencer
        if (expiringProducts.length > 0) {
            response.expiringProductsAlert = {
                message: `Tienes ${expiringProducts.length} producto(s) próximo(s) a vencer en 1 semana`,
                count: expiringProducts.length
            };
        }

        console.log("✅ Respuesta enviada exitosamente");
        res.status(200).json(response);
    } catch (error) {
        console.error("❌ Error completo en getProducts:", error);
        console.error("Stack trace:", error.stack);
        res.status(500).json({ 
            message: "Server error", 
            details: error.message 
        });
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