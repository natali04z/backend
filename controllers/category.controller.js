import Category from "../models/category.js";
import mongoose from "mongoose";
import { checkPermission } from "../utils/permissions.js";

async function generateCategoryId() {
    const lastCategory = await Category.findOne().sort({ id: -1 });

    if (!lastCategory || !/^Ca\d{2}$/.test(lastCategory.id)) {
        return "Ca01";
    }

    const lastNumber = parseInt(lastCategory.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Ca${nextNumber}`;
}

// Obtener todas las categorías
export const getCategories = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_categories")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const categories = await Category.find()
            .select("id name status");

        res.status(200).json(categories);
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Obtener categoría por ID
export const getOneCategory = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_categories_id")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid category ID" });
        }

        const category = await Category.findById(id)
            .select("id name status");

        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.status(200).json(category);
    } catch (error) {
        console.error("Error fetching category:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Crear una nueva categoría
export const postCategory = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_categories")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Name is required" });
        }

        if (name.length < 3 || name.length > 50) {
            return res.status(400).json({ message: "Category name must be between 3 and 50 characters" });
        }

        const existingCategory = await Category.findOne({ name: name.trim().toLowerCase() });
        if (existingCategory) {
            return res.status(409).json({ message: "Category name already exists" });
        }

        const id = await generateCategoryId();
        const newCategory = new Category({
            id,
            name: name.trim(),
            status: 'active'
        });

        await newCategory.save();
        res.status(201).json({ message: "Category created successfully", category: newCategory });
    } catch (error) {
        console.error("Error creating category:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Actualizar una categoría
export const putCategory = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_categories")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { name } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid category ID" });
        }

        if (name && (name.length < 3 || name.length > 50)) {
            return res.status(400).json({ message: "Category name must be between 3 and 50 characters" });
        }

        if (name) {
            const existingCategory = await Category.findOne({
                name: name.trim().toLowerCase(),
                _id: { $ne: id }
            });

            if (existingCategory) {
                return res.status(409).json({ message: "Another category with the same name already exists" });
            }
        }

        const updateData = {};
        if (name) updateData.name = name.trim();

        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select("id name status");

        if (!updatedCategory) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.status(200).json({ message: "Category updated successfully", category: updatedCategory });
    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Actualizar estado de categoría
export const updateCategoryStatus = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_status_categories")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid category ID" });
        }

        if (!status || !["active", "inactive"].includes(status)) {
            return res.status(400).json({ message: "Status must be 'active' or 'inactive'" });
        }

        if (status === 'inactive') {
            const Product = mongoose.model('Product');
            
            const activeProductsCount = await Product.countDocuments({ 
                category: id, 
                status: 'active' 
            });
            
            if (activeProductsCount > 0) {
                return res.status(400).json({ 
                    message: `Cannot deactivate this category. It has ${activeProductsCount} active products associated with it. Please deactivate or reassign these products first.`
                });
            }
        }

        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        ).select("id name status");

        if (!updatedCategory) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.status(200).json({ 
            message: `Category ${status === 'active' ? 'activated' : 'deactivated'} successfully`, 
            category: updatedCategory 
        });
    } catch (error) {
        console.error("Error updating category status:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Eliminar una categoría
export const deleteCategory = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "delete_categories")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid category ID" });
        }

        const deletedCategory = await Category.findByIdAndDelete(id);

        if (!deletedCategory) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({ message: "Server error" });
    }
};