import Branch from "../models/branches.js";

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
    if (!isUpdate || data.name) {
        if (!data.name || data.name.trim() === "") {
            errors.name = "Branch name is required";
        } else if (data.name.length < 2 || data.name.length > 100) {
            errors.name = "Name must be between 2 and 100 characters";
        }
    }

    // Validate location
    if (!isUpdate || data.location) {
        if (!data.location || data.location.trim() === "") {
            errors.location = "Location is required";
        } else if (data.location.length < 2 || data.location.length > 100) {
            errors.location = "Location must be between 2 and 100 characters";
        }
    }

    // Validate status
    if (!isUpdate || data.status) {
        const validStatuses = ["active", "inactive", "pending"];
        if (!data.status || !validStatuses.includes(data.status)) {
            errors.status = "Invalid status. Must be: active, inactive or pending";
        }
    }

    // Validate phone (basic format validation)
    if (!isUpdate || data.phone) {
        const phoneRegex = /^[+]?[\d\s()-]{10,15}$/;
        if (!data.phone || !phoneRegex.test(data.phone)) {
            errors.phone = "Invalid phone number";
        }
    }

    // Validate address
    if (!isUpdate || data.address) {
        if (!data.address || data.address.trim() === "") {
            errors.address = "Address is required";
        } else if (data.address.length < 5 || data.address.length > 200) {
            errors.address = "Address must be between 5 and 200 characters";
        }
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

// Get all branches
export const getBranches = async (req, res) => {
    try {
        const branches = await Branch.find();
        res.status(200).json({ branches });
    } catch (error) {
        console.error("Error fetching branches:", error);
        res.status(500).json({ message: "Error fetching branches" });
    }
};

// Get branch by ID
export const getBranchesById = async (req, res) => {
    try {
        const branch = await Branch.findOne({ id: req.params.id });

        if (!branch) {
            return res.status(404).json({ message: "Branch not found" });
        }

        res.status(200).json(branch);
    } catch (error) {
        console.error("Error fetching branch:", error);
        res.status(500).json({ message: "Error fetching branch" });
    }
};

// Create a new branch
export const postBranches = async (req, res) => {
    try {
        const { name, location, status, phone, address } = req.body;
        
        // Validate data
        const validation = validateBranchData(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ 
                message: "Validation errors",
                errors: validation.errors
            });
        }
        
        // Check if a branch with the same name already exists
        const existingBranch = await Branch.findOne({ name });
        if (existingBranch) {
            return res.status(409).json({ 
                message: "A branch with this name already exists" 
            });
        }
        
        const id = await generateBranchId();
        const newBranch = new Branch({ 
            id, 
            name, 
            location, 
            status, 
            phone, 
            address 
        });
        
        await newBranch.save();
        res.status(201).json({ 
            message: "Branch created successfully", 
            id: newBranch.id, 
           ...newBranch._doc 
        });
    } catch (error) {
        console.error("Error creating branch:", error);
        res.status(500).json({ 
            message: "Error creating branch",
            error: error.message
        });
    }
};

// Update a branch
export const updateBranches = async (req, res) => {
    try {
        // Check if the branch exists
        const existingBranch = await Branch.findById(req.params.id);
        if (!existingBranch) {
            return res.status(404).json({ message: "Branch not found" });
        }

        // Validate data for update
        const validation = validateBranchData(req.body, true);
        if (!validation.isValid) {
            return res.status(400).json({ 
                message: "Validation errors",
                errors: validation.errors
            });
        }

        // Check if branch name already exists (excluding the current branch)
        if (req.body.name) {
            const duplicateBranch = await Branch.findOne({ 
                name: req.body.name, 
                _id: { $ne: req.params.id } 
            });
            if (duplicateBranch) {
                return res.status(409).json({ 
                    message: "Correct data" 
                });
            }
        }

        // Update branch
        const updatedBranch = await Branch.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        res.status(200).json(updatedBranch);
    } catch (error) {
        console.error("Error updating branch:", error);
        res.status(500).json({ message: "Error updating branch", error: error.message });
    }
};

// Delete a branch
export const deleteBranches = async (req, res) => {
    try {
        const deletedBranch = await Branch.findByIdAndDelete(req.params.id);

        if (!deletedBranch) {
            return res.status(404).json({ message: "Branch not found" });
        }

        res.status(200).json({ message: "Branch deleted successfully" });
    } catch (error) {
        console.error("Error deleting branch:", error);
        res.status(500).json({ message: "Error deleting branch", error: error.message });
    }
};

export default {
    getBranches,
    getBranchesById,
    postBranches,
    updateBranches,
    deleteBranches
};