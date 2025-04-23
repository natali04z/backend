import Product from "../models/product.js";
import Category from "../models/category.js";
import Provider from "../models/provider.js"
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

// Función para formatear fecha a YYYY-MM-DD
function formatDate(date) {
    if (!date) return null;
    return date.toISOString().split('T')[0];
}

// Función para formatear precio en pesos colombianos
function formatPrice(price) {
    return `$${price.toLocaleString('es-CO')}`;
}

// Función para formatear las fechas y precios en los productos
function formatProduct(product) {
    const formattedProduct = product.toObject ? product.toObject() : { ...product };
    
    if (formattedProduct.batchDate) {
        formattedProduct.batchDate = formatDate(new Date(formattedProduct.batchDate));
    }
    
    if (formattedProduct.expirationDate) {
        formattedProduct.expirationDate = formatDate(new Date(formattedProduct.expirationDate));
    }
    
    if (formattedProduct.price) {
        formattedProduct.formattedPrice = formatPrice(formattedProduct.price);
    }
    
    return formattedProduct;
}

// Get all products
export const getProducts = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const products = await Product.find()
            .select("id name price stock minimumStock status category provider batchDate expirationDate")
            .populate("category", "name")
            .populate("provider", "name"); 

        // Formatear fechas y precios
        const formattedProducts = products.map(product => formatProduct(product));

        res.status(200).json(formattedProducts);
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
            .select("id name price stock minimumStock status category provider batchDate expirationDate")
            .populate("category", "name")
            .populate("provider", "name");

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        // Formatear fechas y precios
        const formattedProduct = formatProduct(product);

        res.status(200).json(formattedProduct);
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const postProduct = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { name, category, provider, price, stock, minimumStock, status, batchDate, expirationDate } = req.body;

        if (!name || !category || !provider || price === undefined || stock === undefined || minimumStock === undefined || !status || !batchDate || !expirationDate) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (!mongoose.Types.ObjectId.isValid(category)) {
            return res.status(400).json({ message: "Invalid category ID" });
        }

        if (!mongoose.Types.ObjectId.isValid(provider)) {
            return res.status(400).json({ message: "Invalid provider ID" });
        }

        const existingCategory = await Category.findById(category);
        if (!existingCategory) {
            return res.status(404).json({ message: "Category not found" });
        }

        const existingProvider = await Provider.findById(provider);
        if (!existingProvider) {
            return res.status(404).json({ message: "Provider not found" });
        }

        // Validación para precios en pesos colombianos (valores más altos)
        if (typeof price !== "number" || price <= 0) {
            return res.status(400).json({ message: "Price must be a positive number" });
        }

        // Validación para stock mínimo: debe ser menor o igual a 300
        if (!Number.isInteger(minimumStock) || minimumStock > 300) {
            return res.status(400).json({ message: "Minimum stock must be less than or equal to 300 units" });
        }

        // Validación para que el stock sea al menos igual al stock mínimo
        if (!Number.isInteger(stock) || stock < minimumStock) {
            return res.status(400).json({ message: `Stock must be at least equal to the minimum stock (${minimumStock} units)` });
        }

        if (!["active", "inactive"].includes(status)) {
            return res.status(400).json({ message: "Status must be 'active' or 'inactive'" });
        }
        
        // Validar fechas
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

        const id = await generateProductId();
        const newProduct = new Product({
            id,
            name,
            category,
            provider,
            price,
            batchDate: batchDateObj,
            expirationDate: expirationDateObj,
            stock,
            minimumStock,
            status
        });

        await newProduct.save();
        
        // Formatear fechas y precios en la respuesta
        const savedProduct = formatProduct(newProduct);
        
        res.status(201).json({ message: "Product created successfully", product: savedProduct });
    } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Update a product
export const updateProduct = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "edit_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { name, category, provider, price, stock, minimumStock, status, batchDate, expirationDate } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        // Obtener el producto existente para validaciones
        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        let categoryId = null;
        if (category) {
            const existingCategory = await Category.findById(category);
            if (!existingCategory) {
                return res.status(404).json({ message: "Category not found" });
            }
            categoryId = existingCategory._id;
        }
        
        let providerId = null;
        if (provider) {
            const existingProvider = await Provider.findById(provider);
            if (!existingProvider) {
                return res.status(404).json({ message: "Provider not found" });
            }
            providerId = existingProvider._id;
        }
        
        // Validación para precios en pesos colombianos
        if (price !== undefined && (typeof price !== "number" || price <= 0)) {
            return res.status(400).json({ message: "Price must be a positive number" });
        }

        // Validación para minimumStock y stock
        // Si se actualiza el minimumStock, verificar que sea menor o igual a 300
        let newMinimumStock = existingProduct.minimumStock;
        if (minimumStock !== undefined) {
            if (!Number.isInteger(minimumStock) || minimumStock > 300) {
                return res.status(400).json({ message: "Minimum stock must be less than or equal to 300 units" });
            }
            newMinimumStock = minimumStock;
        }
        
        // Si se actualiza el stock, verificar que sea al menos igual al minimumStock (actualizado o existente)
        if (stock !== undefined) {
            if (!Number.isInteger(stock) || stock < newMinimumStock) {
                return res.status(400).json({ message: `Stock must be at least equal to the minimum stock (${newMinimumStock} units)` });
            }
        }
        
        // Validar fechas si se proporcionan
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
        
        // Verificar la relación entre fechas (ya sea con las nuevas fechas o con las existentes)
        const finalBatchDate = batchDateObj || existingProduct.batchDate;
        const finalExpirationDate = expirationDateObj || existingProduct.expirationDate;
        
        if (batchDateObj || expirationDateObj) {
            // Solo verificar si al menos una de las fechas se está actualizando
            if (finalBatchDate > finalExpirationDate) {
                return res.status(400).json({ message: "Expiration date must be after batch date" });
            }
        }
        
        // Crear objeto de actualización
        const updateData = {};
        if (name) updateData.name = name;
        if (categoryId) updateData.category = categoryId;
        if (providerId) updateData.provider = providerId;
        if (price !== undefined) updateData.price = price;
        if (stock !== undefined) updateData.stock = stock;
        if (minimumStock !== undefined) updateData.minimumStock = minimumStock;
        if (status) updateData.status = status;
        if (batchDateObj) updateData.batchDate = batchDateObj;
        if (expirationDateObj) updateData.expirationDate = expirationDateObj;

        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        )
            .select("id name price stock minimumStock status category provider batchDate expirationDate")
            .populate("category", "name")
            .populate("provider", "name");

        // Formatear fechas y precios en la respuesta
        const formattedProduct = formatProduct(updatedProduct);
        
        res.status(200).json({ message: "Product updated successfully", product: formattedProduct });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Delete a product
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