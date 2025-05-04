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

// Get all products
export const getProducts = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_products")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const products = await Product.find()
            .select("id name price stock status category batchDate expirationDate formattedPrice")
            .populate("category", "name");

        res.status(200).json(products);
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

        res.status(200).json(product);
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
        
        res.status(201).json({ 
            message: "Product created successfully. Stock starts at 0 and will increase with purchases.", 
            product: savedProduct 
        });
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

        res.status(200).json({ message: "Product updated successfully", product: updatedProduct });
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

        res.status(200).json({ 
            message: `Product ${status === 'active' ? 'activated' : 'deactivated'} successfully`, 
            product: updatedProduct 
        });
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