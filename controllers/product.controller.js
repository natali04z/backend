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

// Función para verificar si un producto está activo y disponible para venta
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

// Función para verificar productos próximos a vencer
export const checkExpiringProducts = async (daysBeforeExpiration = 7) => {
    try {
        const currentDate = new Date();
        const alertDate = new Date();
        alertDate.setDate(currentDate.getDate() + daysBeforeExpiration);

        const expiringProducts = await Product.find({
            status: "active",
            expirationDate: {
                $gte: currentDate,
                $lte: alertDate
            }
        })
        .select("id name expirationDate stock category")
        .populate("category", "name");

        return expiringProducts.map(product => ({
            id: product.id,
            name: product.name,
            expirationDate: product.expirationDate,
            stock: product.stock,
            category: product.category?.name,
            daysUntilExpiration: Math.ceil((product.expirationDate - currentDate) / (1000 * 60 * 60 * 24))
        }));
    } catch (error) {
        console.error("Error checking expiring products:", error);
        return [];
    }
};

// Función para obtener notificaciones de productos próximos a vencer
export const getExpirationNotifications = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const daysBeforeExpiration = req.query.days ? parseInt(req.query.days) : 7;
        const expiringProducts = await checkExpiringProducts(daysBeforeExpiration);

        res.status(200).json({
            message: `Productos próximos a vencer en los próximos ${daysBeforeExpiration} días`,
            count: expiringProducts.length,
            products: expiringProducts
        });
    } catch (error) {
        console.error("Error getting expiration notifications:", error);
        res.status(500).json({ message: "Server error" });
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

        // Verificar productos próximos a vencer
        const expiringProducts = await checkExpiringProducts();
        
        res.status(200).json({
            products,
            expiringProductsAlert: expiringProducts.length > 0 ? {
                message: `Tienes ${expiringProducts.length} producto(s) próximo(s) a vencer`,
                count: expiringProducts.length
            } : null
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ message: "Server error" });
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

        // Verificar si el producto está próximo a vencer
        const currentDate = new Date();
        const daysUntilExpiration = Math.ceil((product.expirationDate - currentDate) / (1000 * 60 * 60 * 24));
        
        const response = {
            ...product.toObject(),
            expirationAlert: daysUntilExpiration <= 7 && daysUntilExpiration > 0 ? {
                message: `Este producto vence en ${daysUntilExpiration} día(s)`,
                daysUntilExpiration
            } : null
        };

        res.status(200).json(response);
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ message: "Server error" });
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

        // Verificar si el producto se está creando próximo a la fecha de vencimiento
        const currentDate = new Date();
        const daysUntilExpiration = Math.ceil((expirationDateObj - currentDate) / (1000 * 60 * 60 * 24));
        
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
        
        const response = { 
            message: "Product created successfully. Stock starts at 0 and will increase with purchases.", 
            product: savedProduct 
        };

        // Agregar alerta si el producto vence pronto
        if (daysUntilExpiration <= 30 && daysUntilExpiration > 0) {
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

        // Verificar si el producto actualizado está próximo a vencer
        const currentDate = new Date();
        const daysUntilExpiration = Math.ceil((updatedProduct.expirationDate - currentDate) / (1000 * 60 * 60 * 24));
        
        const response = { 
            message: "Product updated successfully", 
            product: updatedProduct 
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

        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        )
            .select("id name price stock status category batchDate expirationDate formattedPrice")
            .populate("category", "name");

        if (!updatedProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        const response = { 
            message: `Product ${status === 'active' ? 'activated' : 'deactivated'} successfully`, 
            product: updatedProduct 
        };

        // Agregar advertencia si se está desactivando un producto
        if (status === 'inactive') {
            response.warning = "El producto ha sido desactivado y no podrá ser vendido hasta que se reactive";
        }

        res.status(200).json(response);
    } catch (error) {
        console.error("Error updating product status:", error);
        res.status(500).json({ message: "Server error" });
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