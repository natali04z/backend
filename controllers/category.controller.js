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

// Get all categories
export const getCategories = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_categories")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const categories = await Category.find()
            .select("id name description status");

        res.status(200).json(categories);
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Get category by ID
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
            .select("id name description status");

        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.status(200).json(category);
    } catch (error) {
        console.error("Error fetching category:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Create a new category
export const postCategory = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_categories")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { name, description, status } = req.body;

        if (!name || !description || !status) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (name.length < 3 || name.length > 50) {
            return res.status(400).json({ message: "Category name must be between 3 and 50 characters" });
        }

        if (description.length < 5 || description.length > 200) {
            return res.status(400).json({ message: "Description must be between 5 and 200 characters" });
        }

        if (!["active", "inactive"].includes(status)) {
            return res.status(400).json({ message: "Status must be 'active' or 'inactive'" });
        }

        const existingCategory = await Category.findOne({ name: name.trim().toLowerCase() });
        if (existingCategory) {
            return res.status(409).json({ message: "Category name already exists" });
        }

        const id = await generateCategoryId();
        const newCategory = new Category({
            id,
            name: name.trim(),
            description,
            status
        });

        await newCategory.save();
        res.status(201).json({ message: "Category created successfully", category: newCategory });
    } catch (error) {
        console.error("Error creating category:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Update a category
export const putCategory = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_categories")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { name, description, status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid category ID" });
        }

        if (name && (name.length < 3 || name.length > 50)) {
            return res.status(400).json({ message: "Category name must be between 3 and 50 characters" });
        }

        if (description && (description.length < 5 || description.length > 200)) {
            return res.status(400).json({ message: "Description must be between 5 and 200 characters" });
        }

        if (status && !["active", "inactive"].includes(status)) {
            return res.status(400).json({ message: "Status must be 'active' or 'inactive'" });
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
        if (description) updateData.description = description;
        if (status) updateData.status = status;

        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select("id name description status");

        if (!updatedCategory) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.status(200).json({ message: "Category updated successfully", category: updatedCategory });
    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Delete a category
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