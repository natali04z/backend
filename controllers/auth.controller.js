import User from "../models/user.js";
import Role from "../models/role.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from 'crypto';
import { sendEmail } from '../utils/emailService.js';

// Registrar usuario
// Registrar usuario
export const registerUser = async (req, res) => {
    try {
        const { name, lastname, contact_number, email, password, role } = req.body;

        if (!name || !lastname || !contact_number || !email || !password || !role) {
            return res.status(400).json({ message: "All fields are required" });
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

// Solicitar restablecimiento de contraseña
export const requestPasswordReset = async (req, res) => {
    let user;
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpires = Date.now() + 3600000; // Token válido por 1 hora
        await user.save();

        const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

        const message = `
            <h1>Password Reset Request</h1>
            <p>Please click on the following link to reset your password:</p>
            <a href="${resetUrl}" clicktracking="off">Reset My Password</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you did not request this reset, please ignore this email.</p>
        `;

        await sendEmail({
            to: user.email,
            subject: 'Password Reset Request',
            html: message
        });

        res.status(200).json({ message: "Password reset email sent successfully" });
    } catch (error) {
        if (user) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();
        }

        res.status(500).json({ message: "Error sending reset email", error: error.message });
    }
};

// Restablecer contraseña con token
export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ message: "Token and new password are required" });
        }

        const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired token" });
        }

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

// Solicitar enlace para configurar contraseña después del primer inicio de sesión
export const requestPasswordSetup = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        const setupToken = crypto.randomBytes(32).toString('hex');
        
        user.resetPasswordToken = crypto.createHash('sha256').update(setupToken).digest('hex');
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();

        const setupUrl = `${process.env.FRONTEND_URL}/setup-password/${setupToken}`;

        const message = `
            <h1>Set Your Password - IceSoft</h1>
            <p>Hello ${user.name},</p>
            <p>Please click on the following link to set up your password:</p>
            <a href="${setupUrl}" clicktracking="off">Set Up My Password</a>
            <p>This link will expire in 1 hour.</p>
            <p>For security reasons, we recommend setting a strong, unique password.</p>
        `;

        await sendEmail({
            to: user.email,
            subject: 'Set Up Your Password - IceSoft',
            html: message
        });

        res.status(200).json({ message: "Password setup link sent successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error sending setup email", error: error.message });
    }
};