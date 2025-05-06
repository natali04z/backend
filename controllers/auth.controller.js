import User from "../models/user.js";
import Role from "../models/role.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from 'crypto';
import { sendEmail } from '../utils/emailService.js';

// Registrar usuario
export const registerUser = async (req, res) => {
    try {
        const { name, lastname, contact_number, email, password, role } = req.body;

        if (!name || !lastname || !contact_number || !email || !password || !role) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Validación para que contact_number solo contenga números
        if (!/^\d+$/.test(contact_number)) {
            return res.status(400).json({ message: "Phone number must contain only digits" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already in use" });
        }

        let roleDoc = null;
        
        if (!roleDoc) {
            try {
                roleDoc = await Role.findById(role);
            } catch (err) {
            }
        }
        
        if (!roleDoc) {
            roleDoc = await Role.findOne({ name: role });
        }
        
        if (!roleDoc) {
            roleDoc = await Role.findOne({ id: role });
        }

        if (!roleDoc) {
            return res.status(400).json({ message: "Invalid role name" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            lastname,
            contact_number,
            email,
            password: hashedPassword,
            role: roleDoc._id
        });

        await newUser.save();
        await newUser.populate("role", "name");

        const token = jwt.sign(
            { id: newUser._id, role: newUser.role._id },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        res.status(201).json({
            message: "User registered successfully",
            token,
            user: {
                name: newUser.name,
                lastname: newUser.lastname,
                contact_number: newUser.contact_number,
                email: newUser.email,
                role: newUser.role.name,
                status: newUser.status
            }
        });

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
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

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
            {id: user._id, role: user.role._id},
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
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
            userId: user._id // Opcional: enviar el ID del usuario para usarlo en el siguiente paso
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

        // Buscar al usuario nuevamente
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Actualizar la contraseña
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        
        // Limpiar cualquier token de restablecimiento existente
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        await user.save();

        res.status(200).json({ message: "Password changed successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error changing password", error: error.message });
    }
};