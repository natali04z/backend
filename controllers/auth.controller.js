import User from "../models/user.js";
import Role from "../models/role.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import nodemailer from 'nodemailer';

// Configuración del transporter de nodemailer para Gmail
const createEmailTransporter = () => {
    return nodemailer.createTransporter({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: 'soporte.icesoft@gmail.com',
            pass: process.env.EMAIL_PASSWORD // icesoft2821726
        }
    });
};

// Función para enviar email con credenciales
const sendCredentialsEmail = async (userEmail, userName, userLastname, plainPassword, userRole) => {
    try {
        const transporter = createEmailTransporter();
        
        const mailOptions = {
            from: `"IceSoft - Sistema" <soporte.icesoft@gmail.com>`,
            to: userEmail,
            subject: 'Bienvenido a IceSoft - Credenciales de acceso',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        .email-container {
                            font-family: Arial, sans-serif;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                            background-color: #f9f9f9;
                        }
                        .email-content {
                            background-color: white;
                            padding: 30px;
                            border-radius: 8px;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        }
                        .header {
                            text-align: center;
                            color: #333;
                            margin-bottom: 30px;
                        }
                        .credentials-box {
                            background-color: #f8f9fa;
                            border: 1px solid #dee2e6;
                            border-radius: 5px;
                            padding: 20px;
                            margin: 20px 0;
                        }
                        .credential-item {
                            margin: 10px 0;
                        }
                        .credential-label {
                            font-weight: bold;
                            color: #495057;
                        }
                        .credential-value {
                            color: #007bff;
                            font-family: monospace;
                            background-color: white;
                            padding: 5px 8px;
                            border-radius: 3px;
                            border: 1px solid #dee2e6;
                        }
                        .warning {
                            background-color: #fff3cd;
                            border: 1px solid #ffeaa7;
                            border-radius: 5px;
                            padding: 15px;
                            margin: 20px 0;
                            color: #856404;
                        }
                        .footer {
                            text-align: center;
                            margin-top: 30px;
                            color: #6c757d;
                            font-size: 14px;
                        }
                    </style>
                </head>
                <body>
                    <div class="email-container">
                        <div class="email-content">
                            <div class="header">
                                <h1>¡Bienvenido a IceSoft!</h1>
                                <p>Hola <strong>${userName} ${userLastname}</strong>,</p>
                                <p>Tu cuenta ha sido creada exitosamente en el sistema IceSoft. A continuación encontrarás tus credenciales de acceso:</p>
                            </div>
                            
                            <div class="credentials-box">
                                <h3 style="margin-top: 0; color: #333;">Credenciales de Acceso</h3>
                                
                                <div class="credential-item">
                                    <div class="credential-label">Email / Usuario:</div>
                                    <div class="credential-value">${userEmail}</div>
                                </div>
                                
                                <div class="credential-item">
                                    <div class="credential-label">Contraseña:</div>
                                    <div class="credential-value">${plainPassword}</div>
                                </div>
                                
                                <div class="credential-item">
                                    <div class="credential-label">Rol asignado:</div>
                                    <div class="credential-value">${userRole}</div>
                                </div>
                            </div>
                            
                            <div class="warning">
                                <strong>⚠️ Importante:</strong>
                                <ul style="margin: 10px 0; padding-left: 20px;">
                                    <li>Guarda estas credenciales en un lugar seguro</li>
                                    <li>Se recomienda cambiar la contraseña después del primer acceso</li>
                                    <li>No compartas estas credenciales con terceros</li>
                                    <li>Si tienes problemas para acceder, contacta al administrador</li>
                                </ul>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <p>Para acceder al sistema, utiliza el siguiente enlace:</p>
                                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" 
                                   style="background-color: #007bff; color: white; padding: 12px 25px; 
                                          text-decoration: none; border-radius: 5px; display: inline-block;">
                                    Acceder al Sistema
                                </a>
                            </div>
                            
                            <div class="footer">
                                <p>Este es un mensaje automático, por favor no respondas a este correo.</p>
                                <p>Si necesitas ayuda, contacta a: <strong>soporte.icesoft@gmail.com</strong></p>
                                <p>© ${new Date().getFullYear()} IceSoft. Todos los derechos reservados.</p>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email enviado exitosamente:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error enviando email:', error);
        return { success: false, error: error.message };
    }
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

        // Guardar la contraseña original para enviarla por email
        const plainPassword = password;
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

        // Enviar email con credenciales
        const roleDisplayName = roleTranslations[roleDoc.name] || roleDoc.name;
        const emailResult = await sendCredentialsEmail(
            newUser.email,
            newUser.name,
            newUser.lastname,
            plainPassword,
            roleDisplayName
        );

        // Log si el email falló, pero no hacer que falle todo el registro
        if (!emailResult.success) {
            console.error('Error enviando email de credenciales:', emailResult.error);
        }

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
            message: emailResult.success 
                ? "User registered successfully and credentials sent to email"
                : "User registered successfully (email notification failed)",
            token,
            data: userResponse,
            emailSent: emailResult.success
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
        
        // NUEVO: Verificar si el rol existe y está activo
        if (!user.role) {
            return res.status(403).json({ 
                message: "Your account has no role assigned. Please contact an administrator." 
            });
        }
        
        // NUEVO: Verificar el estado del rol
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