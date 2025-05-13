import jwt from "jsonwebtoken";
import Role from "../models/role.js";
import User from "../models/user.js";
import mongoose from "mongoose";
import { checkPermissionSync, getDefaultPermissions } from "../utils/permissions.js";

export const authenticateUser = async (req, res, next) => {
  try {
    let token = req.header("Authorization");

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    if (token.startsWith("Bearer ")) {
      token = token.slice(7);
    }

    // Decodificar token con manejo de errores
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (tokenError) {
      console.error("Token verification error:", tokenError);
      return res.status(401).json({ message: "Invalid token" });
    }

    if (!decoded || !decoded.id) {
      return res.status(401).json({ message: "Invalid token content" });
    }

    // Verificar si el usuario existe y está activo
    let user;
    try {
      user = await User.findById(decoded.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
    } catch (userError) {
      console.error("User lookup error:", userError);
      return res.status(500).json({ message: "Error finding user", error: userError.message });
    }

    // Verificar el estado del usuario
    if (user.status === 'inactive') {
      return res.status(403).json({ message: "Your account is inactive. Please contact an administrator." });
    }

    // Intentar obtener el rol directamente sin usar populate
    try {
      // Primero, obtener un rol por defecto (en caso de que nada funcione)
      const defaultRole = await Role.findOne();
      
      if (!defaultRole) {
        console.error("No roles found in the database");
        return res.status(500).json({ message: "System configuration error: No roles available" });
      }
      
      // Ahora, intentar buscar el rol específico (primero del token, luego del usuario)
      let role = null;
      let roleId = null;
      
      // Intento 1: Usar decoded.role si existe
      if (decoded.role) {
        if (mongoose.Types.ObjectId.isValid(decoded.role)) {
          roleId = decoded.role;
          role = await Role.findById(roleId);
        } else {
          role = await Role.findOne({ name: decoded.role });
          roleId = role ? role._id : null;
        }
      }
      
      // Intento 2: Usar user.role si existe y el intento 1 falló
      if (!role && user.role) {
        if (mongoose.Types.ObjectId.isValid(user.role)) {
          roleId = user.role;
          role = await Role.findById(roleId);
        } else {
          role = await Role.findOne({ name: user.role });
          roleId = role ? role._id : null;
        }
      }
      
      // Si ninguno funcionó, usar el rol predeterminado
      if (!role) {
        role = defaultRole;
        roleId = defaultRole._id;
        
        // Actualizar el usuario con el rol predeterminado
        user.role = roleId;
        await user.save();
        console.log(`User ${user._id} role has been updated to default role`);
      }
      
      // Ahora tener más cuidado con el populate
      if (role) {
        try {
          role = await Role.findById(role._id).populate('permissions');
        } catch (populateError) {
          console.error("Error populating permissions:", populateError);
          // Si falla el populate, usar el rol sin populate
          role = await Role.findById(role._id);
        }
      }
      
      // NUEVO: Verificar el estado del rol
      if (role && role.status === 'inactive') {
        return res.status(403).json({ 
          message: "Access denied. Your role is currently inactive. Please contact an administrator." 
        });
      }
      
      // Configurar req.user con valores seguros
      req.user = {
        id: user._id,
        roleId: roleId,
        role: role || { name: 'unknown', permissions: [] },
        status: user.status
      };
      
      next();
    } catch (roleError) {
      console.error("Role processing error:", roleError);
      return res.status(500).json({ 
        message: "Error processing user role", 
        error: roleError.message 
      });
    }
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
  }
};

export const authorizePermission = (permissionCode) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      if (!req.user.role) {
        console.error("User has no role in request object");
        return res.status(401).json({ message: "User role not available" });
      }

      // Verificar nuevamente el estado del usuario (por seguridad adicional)
      if (req.user.status === 'inactive') {
        return res.status(403).json({ message: "Your account is inactive" });
      }

      const role = req.user.role;
      
      // NUEVO: Verificar el estado del rol (verificación adicional)
      if (role.status === 'inactive') {
        return res.status(403).json({ 
          message: "Access denied. Your role is currently inactive. Please contact an administrator." 
        });
      }

      // Caso especial: Si es admin, permitir todo
      if (role.name === 'admin') {
        return next();
      }

      // Verificar el permiso
      let hasPermission = false;

      // 1. Si es un rol predefinido, verificar primero en la configuración estática
      if (role.isDefault) {
        const defaultPermissions = getDefaultPermissions(role.name);
        if (defaultPermissions && defaultPermissions.includes(permissionCode)) {
          hasPermission = true;
        }
      }

      // 2. Si no se encontró en la configuración estática o no es un rol predefinido,
      // verificar en los permisos almacenados
      if (!hasPermission && role.permissions && role.permissions.length > 0) {
        hasPermission = role.permissions.some(permission => {
          // Si es un string
          if (typeof permission === 'string') {
            return permission === permissionCode;
          }
          // Si es un objeto Permission
          if (permission && typeof permission === 'object') {
            // Verificar si tiene el código del permiso
            return permission.code === permissionCode;
          }
          return false;
        });
      }

      if (hasPermission) {
        return next();
      }

      // Si llegamos aquí, no tiene permiso
      return res.status(403).json({
        message: "Insufficient permissions",
        required: permissionCode,
        role: role.name
      });

    } catch (error) {
      console.error("Authorization error:", error);
      return res.status(500).json({ 
        message: "Authorization failed", 
        error: error.message 
      });
    }
  };
};