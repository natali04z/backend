import User from "../models/user.js";
import Role from "../models/role.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

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

// Función auxiliar para validar email
function validateEmail(email) {
    if (!email) return { isValid: false, message: "Email is required" };
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { isValid: false, message: "Invalid email format" };
    }
    
    return { isValid: true };
}

// Mapeo de roles para mostrar en español
const roleTranslations = {
    "admin": "Administrador",
    "assistant": "Asistente", 
    "employee": "Empleado"
};

// Register user
export const registerUser = async (req, res) => {
    try {
        const { name, lastname, contact_number, email, password, role } = req.body;

        // Validaciones básicas de campos requeridos
        if (!name || !lastname || !contact_number || !email || !password || !role) {
            return res.status(400).json({ 
                success: false,
                message: "All fields are required (name, lastname, contact_number, email, password, role)" 
            });
        }

        // Validación de longitud de contraseña
        if (password.length < 6 || password.length > 12) {
            return res.status(400).json({
                success: false,
                message: "Password must be between 6 and 12 characters long",
                field: "password"
            });
        }

        // Validar teléfono usando la función auxiliar
        const phoneValidation = validatePhone(contact_number.toString().trim());
        if (!phoneValidation.isValid) {
            return res.status(400).json({ 
                success: false,
                message: phoneValidation.message,
                field: "contact_number"
            });
        }

        // Validar email
        const emailValidation = validateEmail(email.toString().trim());
        if (!emailValidation.isValid) {
            return res.status(400).json({ 
                success: false,
                message: emailValidation.message,
                field: "email"
            });
        }

        // Validar nombre
        const trimmedName = name.toString().trim();
        if (trimmedName.length < 2 || trimmedName.length > 50) {
            return res.status(400).json({ 
                success: false,
                message: "Name must be between 2 and 50 characters",
                field: "name"
            });
        }

        // Validar apellido
        const trimmedLastname = lastname.toString().trim();
        if (trimmedLastname.length < 2 || trimmedLastname.length > 50) {
            return res.status(400).json({ 
                success: false,
                message: "Lastname must be between 2 and 50 characters",
                field: "lastname"
            });
        }

        // Verificar si el email ya existe
        const existingUser = await User.findOne({ email: email.toString().trim().toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ 
                success: false,
                message: "A user with this email already exists",
                field: "email"
            });
        }

        let roleDoc = null;
        
        // Buscar rol por ID, name o identificador
        if (!roleDoc) {
            try {
                roleDoc = await Role.findById(role);
            } catch (err) {
                // ID inválido, continuar con otras búsquedas
            }
        }
        
        if (!roleDoc) {
            roleDoc = await Role.findOne({ name: role });
        }
        
        if (!roleDoc) {
            roleDoc = await Role.findOne({ id: role });
        }

        if (!roleDoc) {
            return res.status(400).json({ 
                success: false,
                message: "Invalid role identifier",
                field: "role"
            });
        }

        // Encriptar contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: trimmedName,
            lastname: trimmedLastname,
            contact_number: contact_number.toString().trim(),
            email: email.toString().trim().toLowerCase(),
            password: hashedPassword,
            role: roleDoc._id
        });

        await newUser.save();
        await newUser.populate("role", "id name");

        const userResponse = {
            name: newUser.name,
            lastname: newUser.lastname,
            contact_number: newUser.contact_number,
            email: newUser.email,
            status: newUser.status,
            role: {
                id: newUser.role.id,
                name: newUser.role.name,
                displayName: roleTranslations[newUser.role.name] || newUser.role.name
            }
        };

        const token = jwt.sign(
            { id: newUser._id, role: newUser.role._id },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            token,
            data: userResponse
        });

    } catch (error) {
        console.error("Error creating user:", error);
        
        // Manejar errores específicos de MongoDB
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ 
                success: false,
                message: "Validation error: " + validationErrors.join(', ') 
            });
        }
        
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({ 
                success: false,
                message: `A user with this ${field} already exists`,
                field: field
            });
        }
        
        res.status(500).json({ 
            success: false,
            message: "Error creating user. Please try again later." 
        });
    }
};

// Iniciar sesión de usuario
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }
        
        const user = await User.findOne({ email }).populate("role");
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        
        if (user.status === 'inactive') {
            return res.status(403).json({ 
                message: "Your account is inactive. Please contact an administrator." 
            });
        }
        
        // Verificar si el rol existe y está activo
        if (!user.role) {
            return res.status(403).json({ 
                message: "Your account has no role assigned. Please contact an administrator." 
            });
        }
        
        // Verificar el estado del rol
        if (user.role.status === 'inactive') {
            return res.status(403).json({ 
                message: "Access denied. Your role is currently inactive. Please contact an administrator." 
            });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        
        const token = jwt.sign(
            {id: user._id, role: user.role._id},
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );
        
        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                lastname: user.lastname,
                email: user.email,
                role: user.role.name,
                status: user.status
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Obtener usuario autenticado
export const getAuthenticatedUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Verificar si el correo existe en el sistema
export const verifyEmail = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        // Verificar si el usuario existe en el sistema
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Si el usuario existe, enviar respuesta exitosa
        res.status(200).json({ 
            message: "Email verified successfully",
            userId: user._id
        });
    } catch (error) {
        res.status(500).json({ message: "Error verifying email", error: error.message });
    }
};

// Restablecer contraseña después de verificar el correo
export const resetPassword = async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({ message: "Email and new password are required" });
        }

        // Validación de longitud de contraseña
        if (newPassword.length < 6 || newPassword.length > 12) {
            return res.status(400).json({ 
                message: "Password must be between 6 and 12 characters long" 
            });
        }

        // Buscar al usuario nuevamente
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Actualizar la contraseña
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;

        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        await user.save();

        res.status(200).json({ message: "Password changed successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error changing password", error: error.message });
    }
};