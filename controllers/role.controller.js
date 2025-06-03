import Role from "../models/role.js";
import Permission from "../models/permission.js";
import mongoose from "mongoose";
import { getDefaultPermissions, ALL_PERMISSIONS, checkPermission } from "../utils/permissions.js";

// Función para generar ID de rol (Ro01, Ro02, etc.)
async function generateRoleId() {
  try {
    const lastRole = await Role.findOne().sort({ id: -1 });
    
    if (!lastRole || !lastRole.id || !/^Ro\d{2}$/.test(lastRole.id)) {
      return "Ro01";
    }
    
    const lastNumber = parseInt(lastRole.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Ro${nextNumber}`;
  } catch (error) {
    console.error("Error generating role ID:", error);
    // En caso de error, generar un ID basado en timestamp como fallback
    return `Ro${new Date().getTime().toString().slice(-2)}`;
  }
}

export const getRoles = async (req, res) => {
  try {
    const roles = await Role.find().populate('permissions').select('id name permissions status isDefault');
    
    res.status(200).json({ roles });
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({ message: "Error fetching roles", error: error.message });
  }
};

export const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid role ID format" });
    }
    
    const role = await Role.findById(id).populate('permissions');
    
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }
    
    res.status(200).json({ role });
  } catch (error) {
    console.error("Error fetching role:", error);
    res.status(500).json({ message: "Error fetching role", error: error.message });
  }
};

export const postRole = async (req, res) => {
  try {
    const { name, permissions, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Role name is required" });
    }
    
    const normalizedName = name.toLowerCase().trim();
    
    // Verificar si ya existe un rol con este nombre
    const existingRole = await Role.findOne({ name: normalizedName });
    if (existingRole) {
      return res.status(400).json({ message: "Role already exists" });
    }
    
    // Verificar si es un rol predefinido
    const defaultRoles = Role.getDefaultRoles ? Role.getDefaultRoles() : ["admin", "assistant", "employee"];
    const isDefault = defaultRoles.includes(normalizedName);
    
    // Preparar los permisos para el rol
    let rolePermissions = [];
    
    if (isDefault) {
      try {
        // Obtener códigos de permisos por defecto para este rol
        const defaultPermissionsCodes = getDefaultPermissions(normalizedName);
        
        // Buscar los IDs de los permisos en la base de datos
        if (defaultPermissionsCodes && defaultPermissionsCodes.length > 0) {
          const foundPermissions = await Permission.find({
            code: { $in: defaultPermissionsCodes }
          });
          rolePermissions = foundPermissions.map(perm => perm._id);
        }
      } catch (permError) {
        console.error("Error getting default permissions:", permError);
        // Continuar con un array vacío de permisos
      }
    } else if (permissions && Array.isArray(permissions)) {
      // Verificar si los permisos recibidos son ObjectId válidos
      const validPermissions = permissions.filter(perm => 
        mongoose.Types.ObjectId.isValid(perm)
      );
      rolePermissions = validPermissions;
    }
    
    // Generar ID único para el rol
    const roleId = await generateRoleId();
    
    // Crear y guardar el nuevo rol
    const newRole = new Role({
      id: roleId,               // ID único generado
      name: normalizedName,     // Nombre normalizado
      description: description || "", // Descripción opcional
      isDefault,                // Indicador de rol predefinido
      permissions: rolePermissions, // Permisos asignados
      status: "active"          // Estado inicial activo
    });
    
    await newRole.save();
    
    // Poblar los permisos para la respuesta
    const savedRole = await Role.findById(newRole._id).populate('permissions');
    
    res.status(201).json({ 
      message: "Role created successfully",
      role: savedRole || newRole // Devolver el rol con permisos poblados o el rol original
    });
  } catch (error) {
    console.error("Error creating role:", error);
    res.status(500).json({ message: "Error creating role", error: error.message });
  }
};

export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions, name, description } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid role ID format" });
    }
    
    // Encontrar el rol
    const role = await Role.findById(id);
    
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }
    
    // ✅ VALIDACIÓN: No permitir modificar el rol de administrador
    if (role.name === "admin") {
      return res.status(403).json({ message: "Admin role cannot be modified" });
    }
    
    // Actualizar permisos si se proporcionan
    if (permissions && Array.isArray(permissions)) {
      // Verificar si los IDs de permisos son válidos
      const validPermissionIds = permissions.filter(perm => 
        mongoose.Types.ObjectId.isValid(perm)
      );
      
      if (validPermissionIds.length === 0) {
        return res.status(400).json({ message: "No valid permission IDs provided" });
      }
      
      // Verificar si todos los permisos existen en la base de datos
      const permissionsExist = await Permission.find({
        _id: { $in: validPermissionIds }
      });
      
      if (permissionsExist.length !== validPermissionIds.length) {
        return res.status(400).json({ 
          message: "Some of the provided permission IDs do not exist",
          valid: permissionsExist.length,
          provided: validPermissionIds.length
        });
      }
      
      role.permissions = validPermissionIds;
    }
    
    // Actualizar el nombre si se proporciona y no es un rol predeterminado
    if (name && !role.isDefault) {
      const normalizedName = name.toLowerCase().trim();
      
      // Verificar si ya existe otro rol con este nombre
      const existingRole = await Role.findOne({ name: normalizedName, _id: { $ne: id } });
      if (existingRole) {
        return res.status(400).json({ message: "Another role already exists with this name" });
      }
      
      role.name = normalizedName;
    }
    
    // Actualizar descripción si se proporciona
    if (description !== undefined) {
      role.description = description;
    }
    
    await role.save();
    
    // Poblar los permisos para la respuesta
    const updatedRole = await Role.findById(id).populate('permissions');
    
    res.status(200).json({
      message: "Role updated successfully",
      role: updatedRole || role // Usar el rol poblado o el rol original
    });
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).json({ message: "Error updating role", error: error.message });
  }
};

// Cambiar el estado del rol (active/inactive)
export const toggleRoleStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid role ID format" });
    }

    const { id } = req.params;
    const { status } = req.body;
    
    // Validar que el estado sea uno de los valores permitidos ("active" o "inactive")
    if (!status || !["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Status must be either 'active' or 'inactive'" });
    }
    
    const role = await Role.findById(id);
    
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }
    
    // ✅ VALIDACIÓN: No permitir cambiar el estado del rol de administrador
    if (role.name === "admin") {
      return res.status(403).json({ message: "Admin role status cannot be modified" });
    }
    
    // Solo actualizar si el estado es diferente
    if (role.status !== status) {
      const updatedRole = await Role.findByIdAndUpdate(
        id,
        { status },
        { new: true, runValidators: true }
      ).populate('permissions');
      
      return res.status(200).json({
        message: `Role ${status === "active" ? 'activated' : 'deactivated'} successfully`,
        role: updatedRole || { ...role.toObject(), status } // Fallback por si falla el populate
      });
    } else {
      return res.status(200).json({
        message: `Role is already ${status === "active" ? 'active' : 'inactive'}`,
        role: await Role.findById(id).populate('permissions') || role
      });
    }
  } catch (error) {
    console.error("Error updating role status:", error);
    res.status(500).json({ message: "Error updating role status", error: error.message });
  }
};

export const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid role ID format" });
    }
    
    // Encontrar el rol
    const role = await Role.findById(id);
    
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }
    
    // ✅ VALIDACIÓN: No permitir eliminar roles predeterminados (admin, assistant, employee)
    if (role.isDefault || ["admin", "assistant", "employee"].includes(role.name)) {
      return res.status(400).json({ message: "Cannot delete default roles" });
    }
    
    // Verificar si hay usuarios con este rol antes de eliminarlo
    const User = mongoose.model('User');
    const usersWithRole = await User.countDocuments({ role: id });
    
    if (usersWithRole > 0) {
      return res.status(400).json({ 
        message: "Cannot delete role because it is assigned to users",
        usersCount: usersWithRole
      });
    }
    
    await Role.findByIdAndDelete(id);
    
    res.status(200).json({ message: "Role deleted successfully" });
  } catch (error) {
    console.error("Error deleting role:", error);
    res.status(500).json({ message: "Error deleting role", error: error.message });
  }
};