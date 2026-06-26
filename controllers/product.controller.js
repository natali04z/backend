import Product from "../models/product.js";
import Category from "../models/category.js";
import Provider from "../models/provider.js";
import mongoose from "mongoose";
import { checkPermission } from "../utils/permissions.js";

// ─── CORREGIDO: prefijo "Pd" para no colisionar con proveedores (Pr) ──────────
async function generateProductId() {
    const lastProduct = await Product.findOne().sort({ _id: -1 });

    if (!lastProduct || !/^Pd\d{2}$/.test(lastProduct.id)) {
        return "Pd01";
    }

    const lastNumber = parseInt(lastProduct.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Pd${nextNumber}`;
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

    let dateObj;
    if (date instanceof Date) {
        dateObj = date;
    } else {
        dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) return null;
    }

    return dateObj.toISOString();
}

export const validateProductForSale = async (productId) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return { isValid: false, message: "ID de producto inválido" };
        }

        const product = await Product.findById(productId);

        if (!product) {
            return { isValid: false, message: "Producto no encontrado" };
        }

        if (product.status !== "active") {
            return { isValid: false, message: "El producto está inactivo y no puede ser vendido" };
        }

        if (product.stock <= 0) {
            return { isValid: false, message: "Producto sin stock disponible" };
        }

        return { isValid: true, product };
    } catch (error) {
        console.error("Error validating product for sale:", error);
        return { isValid: false, message: "Error interno del servidor" };
    }
};

// ─── GET ALL PRODUCTS ─────────────────────────────────────────────────────────
export const getProducts = async (req, res) => {
    try {
        console.log("🔍 getProducts iniciado");
        console.log("Usuario:", req.user);

        if (!checkPermission(req.user.role, "view_products")) {
            console.log("❌ Sin permisos para ver productos");
            return res.status(403).json({ message: "Unauthorized access" });
        }

        // Soporte para filtrar por proveedor vía query param: /products?providerId=xxx
        const filter = {};
        if (req.query.providerId) {
            if (!mongoose.Types.ObjectId.isValid(req.query.providerId)) {
                return res.status(400).json({ message: "Invalid provider ID format" });
            }
            filter.provider = req.query.providerId;
        }

        console.log("🔍 Consultando productos en BD...");
        const products = await Product.find(filter)
            .select("id name price stock status category provider batchDate expirationDate formattedPrice")
            .populate("category", "name")
            .populate("provider", "id company name");

        console.log("✅ Productos encontrados:", products.length);

        const productsWithDays = products.map(product => ({
            ...product.toObject(),
            daysUntilExpiration: calculateDaysUntilExpiration(product.expirationDate)
        }));

        const currentDate = new Date();
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(currentDate.getDate() + 7);

        const expiringProducts = products.filter(product => {
            if (!product.expirationDate) return false;
            const expDate = new Date(product.expirationDate);
            return expDate >= currentDate && expDate <= sevenDaysFromNow && product.status === "active";
        });

        const response = { products: productsWithDays };

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
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// ─── GET PRODUCT BY ID ────────────────────────────────────────────────────────
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
            .select("id name price stock status category provider batchDate expirationDate formattedPrice")
            .populate("category", "name")
            .populate("provider", "id company name");

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        const daysUntilExpiration = calculateDaysUntilExpiration(product.expirationDate);

        const response = {
            ...product.toObject(),
            daysUntilExpiration,
            expirationAlert: daysUntilExpiration <= 7 && daysUntilExpiration > 0
                ? { message: `Este producto vence en ${daysUntilExpiration} día(s)`, daysUntilExpiration }
                : null
        };

        res.status(200).json(response);
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// ─── GET PRODUCTS BY PROVIDER ─────────────────────────────────────────────────
// Soporta dos rutas:
//   GET /providers/:id/products  → req.params.id
//   GET /products?providerId=xxx → req.query.providerId  (manejado en getProducts)
export const getProductsByProvider = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_products")) {
            return res.status(403).json({ success: false, message: "Unauthorized access" });
        }

        const providerId = req.params.id ?? req.query.providerId;

        if (!providerId) {
            return res.status(400).json({ success: false, message: "Provider ID is required" });
        }

        if (!mongoose.Types.ObjectId.isValid(providerId)) {
            return res.status(400).json({ success: false, message: "Invalid provider ID format" });
        }

        // Verificar que el proveedor existe
        const providerExists = await Provider.findById(providerId).select("id company name status");
        if (!providerExists) {
            return res.status(404).json({ success: false, message: "Provider not found" });
        }

        const products = await Product.find({ provider: providerId })
            .select("id name price stock status category provider batchDate expirationDate formattedPrice")
            .populate("category", "name")
            .populate("provider", "id company name");

        const productsWithDays = products.map(product => ({
            ...product.toObject(),
            daysUntilExpiration: calculateDaysUntilExpiration(product.expirationDate)
        }));

        res.status(200).json({
            success: true,
            provider: providerExists,
            count: productsWithDays.length,
            data: productsWithDays
        });
    } catch (error) {
        console.error("Error fetching products by provider:", error);
        res.status(500).json({ success: false, message: "Server error", details: error.message });
    }
};

// ─── CREATE PRODUCT ───────────────────────────────────────────────────────────
// Soporta dos rutas:
//   POST /providers/:id/products  → providerId viene de req.params.id
//   POST /products                → providerId viene de req.body.providerId
export const postProduct = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { name, category, price, batchDate, expirationDate } = req.body;
        const providerId = req.params.id ?? req.body.providerId;
        const initialStock = 0;

        if (!name || !category || price === undefined || !batchDate || !expirationDate || !providerId) {
            return res.status(400).json({
                message: "All fields are required (name, category, price, batchDate, expirationDate, providerId)"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(category)) {
            return res.status(400).json({ message: "Invalid category ID" });
        }

        if (!mongoose.Types.ObjectId.isValid(providerId)) {
            return res.status(400).json({ message: "Invalid provider ID" });
        }

        // Validar que el proveedor existe y está activo
        const existingProvider = await Provider.findById(providerId);
        if (!existingProvider) {
            return res.status(404).json({ message: "Provider not found" });
        }
        if (existingProvider.status !== "active") {
            return res.status(400).json({ message: "Cannot assign product to an inactive provider" });
        }

        // Validar categoría
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
            provider: providerId,
            price,
            batchDate: batchDateObj,
            expirationDate: expirationDateObj,
            stock: initialStock
        });

        await newProduct.save();

        const savedProduct = await Product.findById(newProduct._id)
            .select("id name price stock status category provider batchDate expirationDate formattedPrice")
            .populate("category", "name")
            .populate("provider", "id company name");

        const productResponse = {
            ...savedProduct.toObject(),
            daysUntilExpiration
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

// ─── UPDATE PRODUCT ───────────────────────────────────────────────────────────
export const updateProduct = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "edit_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { name, category, price, batchDate, expirationDate, providerId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        const updateData = {};

        // Validar y actualizar proveedor si se proporciona
        if (providerId !== undefined) {
            if (!mongoose.Types.ObjectId.isValid(providerId)) {
                return res.status(400).json({ message: "Invalid provider ID" });
            }
            const existingProvider = await Provider.findById(providerId);
            if (!existingProvider) {
                return res.status(404).json({ message: "Provider not found" });
            }
            if (existingProvider.status !== "active") {
                return res.status(400).json({ message: "Cannot assign product to an inactive provider" });
            }
            updateData.provider = providerId;
        }

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
            updateData.category = existingCategory._id;
        }

        if (price !== undefined) {
            if (typeof price !== "number" || price <= 0) {
                return res.status(400).json({ message: "Price must be a positive number" });
            }
            if (!Number.isInteger(price)) {
                return res.status(400).json({ message: "Price must be an integer" });
            }
            updateData.price = price;
        }

        let batchDateObj, expirationDateObj;

        if (batchDate) {
            batchDateObj = new Date(batchDate);
            if (isNaN(batchDateObj.getTime())) {
                return res.status(400).json({ message: "Batch date is invalid" });
            }
            updateData.batchDate = batchDateObj;
        }

        if (expirationDate) {
            expirationDateObj = new Date(expirationDate);
            if (isNaN(expirationDateObj.getTime())) {
                return res.status(400).json({ message: "Expiration date is invalid" });
            }
            updateData.expirationDate = expirationDateObj;
        }

        const finalBatchDate = batchDateObj || existingProduct.batchDate;
        const finalExpirationDate = expirationDateObj || existingProduct.expirationDate;

        if ((batchDateObj || expirationDateObj) && finalBatchDate > finalExpirationDate) {
            return res.status(400).json({ message: "Expiration date must be after batch date" });
        }

        if (name) updateData.name = name;

        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        )
            .select("id name price stock status category provider batchDate expirationDate formattedPrice")
            .populate("category", "name")
            .populate("provider", "id company name");

        const daysUntilExpiration = calculateDaysUntilExpiration(updatedProduct.expirationDate);

        const response = {
            message: "Product updated successfully",
            product: { ...updatedProduct.toObject(), daysUntilExpiration }
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

// ─── UPDATE PRODUCT STATUS ────────────────────────────────────────────────────
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
            { new: true, runValidators: true, useFindAndModify: false }
        )
            .select("id name price stock status category provider batchDate expirationDate formattedPrice")
            .populate("category", "name")
            .populate("provider", "id company name");

        if (!updatedProduct) {
            return res.status(404).json({ message: "Product not found after update" });
        }

        const response = {
            message: `Product ${status === "active" ? "activated" : "deactivated"} successfully`,
            product: {
                ...updatedProduct.toObject(),
                daysUntilExpiration: calculateDaysUntilExpiration(updatedProduct.expirationDate)
            }
        };

        if (status === "inactive") {
            response.warning = "El producto ha sido desactivado y no podrá ser vendido hasta que se reactive";
        }

        res.status(200).json(response);
    } catch (error) {
        console.error("Error updating product status:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ─── DELETE PRODUCT ───────────────────────────────────────────────────────────
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