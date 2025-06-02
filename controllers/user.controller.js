import User from "../models/user.js";
import Role from "../models/role.js";
import mongoose from "mongoose";

// Mapeo de nombres de roles a español
const roleTranslations = {
    "admin": "Administrador",
    "assistant": "Asistente", 
    "employee": "Empleado",
    // Añade más roles según sea necesario
};

// Función auxiliar para validar teléfono
function validatePhone(phone) {
    if (!phone) return { isValid: false, message: "Contact phone is required" };
    
    if (!/^\d+$/.test(phone)) {
        return { isValid: false, message: "Contact phone must contain only digits" };
    }
    
    if (phone.length < 10) {
        return { isValid: false, message: "Contact phone must be at least 10 digits" };
    }
    
    return { isValid: true };
}

// Función para procesar usuarios y añadir displayName para roles
const processUserWithDisplayName = (user) => {
    if (!user) return null;
    
    const userData = user.toObject ? user.toObject() : user;
    
    if (userData.role) {
        if (typeof userData.role === 'string') {
            // Solo tenemos el ID del rol, no podemos traducir
            return userData;
        } else if (userData.role && userData.role.name) {
            // Añadir displayName para el rol
            userData.role.displayName = roleTranslations[userData.role.name] || userData.role.name;
        }
    }
    
    return userData;
};

// Get all users
export const getUsers = async (req, res) => {
    try {
        const users = await User.find()
            .select("-password")
            .populate("role", "id name");
        
        // Añadir displayName para cada usuario
        const usersWithDisplayNames = users.map(user => processUserWithDisplayName(user));
        
        res.status(200).json({ users: usersWithDisplayNames });
    } catch (error) {
        res.status(500).json({ message: "Error fetching users", error: error.message });
    }
};

// Get own profile
export const getProfile = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: "Authentication required" });
        }
        
        let userId;
        if (req.user._id) {
            userId = req.user._id;
        } else if (req.user.id) {
            userId = req.user.id;
        } else {
            return res.status(401).json({ message: "User ID not found in authentication token" });
        }
        
        const user = await User.findById(userId)
            .select("-password")
            .populate("role", "id name");
            
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        // Procesar usuario para añadir displayName al rol
        const processedUser = processUserWithDisplayName(user);
        
        res.status(200).json(processedUser);
    } catch (error) {
        res.status(500).json({ message: "Error fetching profile", error: error.message });
    }
};

// Get user by ID
export const getOneUser = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const user = await User.findById(id)
            .select("-password")
            .populate("role", "id name");
            
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Procesar usuario para añadir displayName al rol
        const processedUser = processUserWithDisplayName(user);
        
        res.status(200).json(processedUser);
    } catch (error) {
        res.status(500).json({ message: "Error fetching user", error: error.message });
    }
};

// Update user
export const putUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, lastname, contact_number, email, role, status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }
        
        // Validar teléfono si se proporciona
        if (contact_number !== undefined) {
            if (contact_number === "") {
                return res.status(400).json({ 
                    success: false,
                    message: "Contact phone cannot be empty",
                    field: "contact_number"
                });
            }
            
            const phoneValidation = validatePhone(contact_number.toString().trim());
            if (!phoneValidation.isValid) {
                return res.status(400).json({ 
                    success: false,
                    message: phoneValidation.message,
                    field: "contact_number"
                });
            }
        }
        
        if (!req.user) {
            return res.status(401).json({ message: "Authentication required" });
        }
        
        let currentUserId;
        if (req.user._id) {
            currentUserId = req.user._id.toString ? req.user._id.toString() : String(req.user._id);
        } else if (req.user.id) {
            currentUserId = req.user.id.toString ? req.user.id.toString() : String(req.user.id);
        } else {
            return res.status(401).json({ message: "User ID not found in authentication token" });
        }
        
        let isAdmin = false;
        if (typeof req.user.role === 'string') {
            isAdmin = req.user.role === 'admin';
        } else if (req.user.role && typeof req.user.role === 'object') {
            isAdmin = req.user.role.name === 'admin';
        } else if (req.user.role && req.user.role._id) {
            const roleDoc = await Role.findById(req.user.role);
            isAdmin = roleDoc && roleDoc.name === 'admin';
        }

        if (currentUserId !== id && !isAdmin) {
            return res.status(403).json({ message: "Unauthorized to edit this user" });
        }

        let updateData = { name, lastname, email };

        // Validar y agregar contact_number si se proporciona
        if (contact_number !== undefined) {
            updateData.contact_number = contact_number.toString().trim();
        }

        if (role && currentUserId === id) {
            return res.status(403).json({ message: "You cannot update your own role" });
        }

        if (isAdmin && role && currentUserId !== id) {
            const roleDoc = await Role.findById(role);
            if (!roleDoc) {
                return res.status(400).json({ message: "Invalid role ID" });
            }
            updateData.role = role;
        }

        if (isAdmin && status) {
            if (!['active', 'inactive'].includes(status)) {
                return res.status(400).json({ message: "Status must be 'active' or 'inactive'" });
            }
            updateData.status = status;
        }

        if (currentUserId === id && status === 'inactive') {
            return res.status(403).json({ message: "You cannot deactivate your own account" });
        }

        const updatedUser = await User.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select("-password").populate("role", "id name");

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // Procesar usuario para añadir displayName al rol
        const processedUser = processUserWithDisplayName(updatedUser);

        res.status(200).json({
            message: "User updated successfully",
            user: processedUser
        });

    } catch (error) {
        res.status(500).json({ message: "Error updating user", error: error.message });
    }
};

// Update user status (Admin only)
export const updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        let isAdmin = false;
        if (typeof req.user.role === 'string') {
            isAdmin = req.user.role === 'admin';
        } else if (req.user.role && typeof req.user.role === 'object') {
            isAdmin = req.user.role.name === 'admin';
        } else if (req.user.role && req.user.role._id) {
            const roleDoc = await Role.findById(req.user.role);
            isAdmin = roleDoc && roleDoc.name === 'admin';
        }

        if (!isAdmin) {
            return res.status(403).json({ message: "Only administrators can update user status" });
        }

        if (!status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({ message: "Status must be 'active' or 'inactive'" });
        }

        let currentUserId;
        if (req.user._id) {
            currentUserId = req.user._id.toString();
        } else if (req.user.id) {
            currentUserId = req.user.id.toString();
        }

        if (currentUserId === id && status === 'inactive') {
            return res.status(403).json({ message: "You cannot deactivate your own account" });
        }

        const updatedUser = await User.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        ).select("-password").populate("role", "id name");

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // Procesar usuario para añadir displayName al rol
        const processedUser = processUserWithDisplayName(updatedUser);

        res.status(200).json({
            message: `User status updated to ${status}`,
            user: processedUser
        });

    } catch (error) {
        res.status(500).json({ message: "Error updating user status", error: error.message });
    }
};

// Delete a user
export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        let isAdmin = false;
        if (typeof req.user.role === 'string') {
            isAdmin = req.user.role === 'admin';
        } else if (req.user.role && typeof req.user.role === 'object') {
            isAdmin = req.user.role.name === 'admin';
        } else if (req.user.role && req.user.role._id) {
            const roleDoc = await Role.findById(req.user.role);
            isAdmin = roleDoc && roleDoc.name === 'admin';
        }

        if (!isAdmin) {
            return res.status(403).json({ message: "Only administrators can delete users" });
        }

        let currentUserId;
        if (req.user._id) {
            currentUserId = req.user._id.toString();
        } else if (req.user.id) {
            currentUserId = req.user.id.toString();
        }

        if (currentUserId === id) {
            return res.status(403).json({ message: "You cannot delete your own account" });
        }

        const deletedUser = await User.findByIdAndDelete(id);

        if (!deletedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ message: "User deleted successfully" });

    } catch (error) {
        res.status(500).json({ message: "Error deleting user", error: error.message });
    }
};