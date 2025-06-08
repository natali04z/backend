import Branch from "../models/branches.js";
import mongoose from "mongoose";

async function generateBranchId() {
    const lastBranch = await Branch.findOne().sort({ id: -1 });

    if (!lastBranch || !/^Br\d{2}$/.test(lastBranch.id)) {
        return "Br01";
    }

    const lastNumber = parseInt(lastBranch.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Br${nextNumber}`;
}

// Field validation
function validateBranchData(data, isUpdate = false) {
    const errors = {};

    // Validate name
    if (!isUpdate || data.hasOwnProperty('name')) {
        if (!data.name || typeof data.name !== 'string' || data.name.trim() === "") {
            errors.name = "Branch name is required";
        } else if (data.name.trim().length < 2 || data.name.trim().length > 100) {
            errors.name = "Name must be between 2 and 100 characters";
        }
    }

    // Validate location
    if (!isUpdate || data.hasOwnProperty('location')) {
        if (!data.location || typeof data.location !== 'string' || data.location.trim() === "") {
            errors.location = "Location is required";
        } else if (data.location.trim().length < 2 || data.location.trim().length > 100) {
            errors.location = "Location must be between 2 and 100 characters";
        }
    }

    // Validate status (only if provided)
    if (data.hasOwnProperty('status')) {
        const validStatuses = ["active", "inactive", "pending"];
        if (!data.status || !validStatuses.includes(data.status)) {
            errors.status = "Invalid status. Must be: active, inactive or pending";
        }
    }

    // Validate phone
    if (!isUpdate || data.hasOwnProperty('phone')) {
        const phoneRegex = /^[+]?[\d\s()-]{10,15}$/;
        if (!data.phone || typeof data.phone !== 'string' || !phoneRegex.test(data.phone.trim())) {
            errors.phone = "Invalid phone number format";
        }
    }

    // Validate address
    if (!isUpdate || data.hasOwnProperty('address')) {
        if (!data.address || typeof data.address !== 'string' || data.address.trim() === "") {
            errors.address = "Address is required";
        } else if (data.address.trim().length < 5 || data.address.trim().length > 200) {
            errors.address = "Address must be between 5 and 200 characters";
        }
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

function checkPermission(userRole, permission) {
    return true;
}

// Get all branches
export const getBranches = async (req, res) => {
    try {
        const branches = await Branch.find();
        res.status(200).json({ 
            success: true,
            branches 
        });
    } catch (error) {
        console.error("Error fetching branches:", error);
        res.status(500).json({ 
            success: false,
            message: "Error fetching branches",
            error: error.message
        });
    }
};

// Get branch by ID
export const getBranchesById = async (req, res) => {
    try {
        const branch = await Branch.findOne({ id: req.params.id });

        if (!branch) {
            return res.status(404).json({ 
                success: false,
                message: "Branch not found" 
            });
        }

        res.status(200).json({
            success: true,
            branch
        });
    } catch (error) {
        console.error("Error fetching branch:", error);
        res.status(500).json({ 
            success: false,
            message: "Error fetching branch",
            error: error.message
        });
    }
};

// Create a new branch
export const postBranches = async (req, res) => {
    try {
        console.log("Request body:", req.body); // Debug log
        
        const { name, location, phone, address, status = "active" } = req.body;
        
        // Validate data
        const validation = validateBranchData(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ 
                success: false,
                message: "Validation errors",
                errors: validation.errors
            });
        }
        
        // Check if a branch with the same name already exists
        const existingBranch = await Branch.findOne({ 
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
        });
        if (existingBranch) {
            return res.status(409).json({ 
                success: false,
                message: "A branch with this name already exists" 
            });
        }
        
        const id = await generateBranchId();
        const newBranch = new Branch({ 
            id, 
            name: name.trim(), 
            location: location.trim(), 
            phone: phone.trim(), 
            address: address.trim(),
            status: status || "active"
        });
        
        await newBranch.save();
        res.status(201).json({ 
            success: true,
            message: "Branch created successfully", 
            branch: {
                id: newBranch.id,
                ...newBranch._doc
            }
        });
    } catch (error) {
        console.error("Error creating branch:", error);
        res.status(500).json({ 
            success: false,
            message: "Error creating branch",
            error: error.message
        });
    }
};

// Update a branch
export const updateBranches = async (req, res) => {
    try {
        const existingBranch = await Branch.findOne({ id: req.params.id });
        if (!existingBranch) {
            return res.status(404).json({ 
                success: false,
                message: "Branch not found" 
            });
        }

        // Validate data for update
        const validation = validateBranchData(req.body, true);
        if (!validation.isValid) {
            console.log("Update validation errors:", validation.errors);
            return res.status(400).json({ 
                success: false,
                message: "Validation errors",
                errors: validation.errors
            });
        }

        // Check if branch name already exists (excluding the current branch)
        if (req.body.name) {
            const duplicateBranch = await Branch.findOne({ 
                name: { $regex: new RegExp(`^${req.body.name.trim()}$`, 'i') },
                id: { $ne: req.params.id } 
            });
            if (duplicateBranch) {
                return res.status(409).json({ 
                    success: false,
                    message: "A branch with this name already exists" 
                });
            }
        }

        // Prepare update data
        const updateData = {};
        if (req.body.name) updateData.name = req.body.name.trim();
        if (req.body.location) updateData.location = req.body.location.trim();
        if (req.body.phone) updateData.phone = req.body.phone.trim();
        if (req.body.address) updateData.address = req.body.address.trim();
        if (req.body.status) updateData.status = req.body.status;

        // Update branch using the custom id field
        const updatedBranch = await Branch.findOneAndUpdate(
            { id: req.params.id },
            updateData,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: "Branch updated successfully",
            branch: updatedBranch
        });
    } catch (error) {
        console.error("Error updating branch:", error);
        res.status(500).json({ 
            success: false,
            message: "Error updating branch", 
            error: error.message 
        });
    }
};

// Delete a branch
export const deleteBranches = async (req, res) => {
    try {
        // Use custom id field instead of MongoDB _id
        const deletedBranch = await Branch.findOneAndDelete({ id: req.params.id });

        if (!deletedBranch) {
            return res.status(404).json({ 
                success: false,
                message: "Branch not found" 
            });
        }

        res.status(200).json({ 
            success: true,
            message: "Branch deleted successfully" 
        });
    } catch (error) {
        console.error("Error deleting branch:", error);
        res.status(500).json({ 
            success: false,
            message: "Error deleting branch", 
            error: error.message 
        });
    }
};

// Update branch status - CORREGIDO para coincidir con el frontend
export const updateBranchStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !["active", "inactive"].includes(status)) {
            return res.status(400).json({ 
                success: false,
                message: "Status must be 'active' or 'inactive'" 
            });
        }
        const existingBranch = await Branch.findOne({ id: id });
        if (!existingBranch) {
            return res.status(404).json({ 
                success: false,
                message: "Branch not found" 
            });
        }

        if (status === 'inactive') {
        }

        const updatedBranch = await Branch.findOneAndUpdate(
            { id: id },
            { status: status },
            { new: true, runValidators: true }
        );

        console.log("Branch status updated successfully:", updatedBranch);

        // Respuesta de éxito
        res.status(200).json({
            success: true,
            message: `Branch ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
            branch: {
                id: updatedBranch.id,
                name: updatedBranch.name,
                status: updatedBranch.status
            }
        });

    } catch (error) {
        console.error("Error updating branch status:", error);
        res.status(500).json({ 
            success: false,
            message: "Server error",
            error: error.message 
        });
    }
};