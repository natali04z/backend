import Role from "../models/role.js";
import { getDefaultPermissions } from "../utils/permissions.js";

export const getRoles = async (req, res) => {
  try {
    const roles = await Role.find().select('name permissions');
    res.status(200).json({ roles });
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({ message: "Error fetching roles" });
  }
};

export const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await Role.findById(id);
    
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }
    
    res.status(200).json({ role });
  } catch (error) {
    console.error("Error fetching role:", error);
    res.status(500).json({ message: "Error fetching role" });
  }
};

export const postRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Role name is required" });
    }
    
    const normalizedName = name.toLowerCase().trim();
    
    const existingRole = await Role.findOne({ name: normalizedName });
    if (existingRole) {
      return res.status(400).json({ message: "Role already exists" });
    }
    
    const defaultRoles = Role.getDefaultRoles();
    const isDefault = defaultRoles.includes(normalizedName);
    
    let rolePermissions = [];
    
    if (isDefault) {
      const defaultPermissions = getDefaultPermissions(normalizedName);
      rolePermissions = defaultPermissions.map(perm => ({ name: perm }));
    } else if (permissions && Array.isArray(permissions)) {
      rolePermissions = permissions.map(perm => ({ name: perm }));
    }
    
    // Crear y guardar el nuevo rol
    const newRole = new Role({
      name: normalizedName,
      isDefault,
      permissions: rolePermissions
    });
    
    await newRole.save();
    res.status(201).json({ 
      message: "Role created successfully",
      role: newRole
    });
  } catch (error) {
    console.error("Error creating role:", error);
    res.status(500).json({ message: "Error creating role" });
  }
};

// Actualizar un rol existente
export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;
    
    // Encontrar el rol
    const role = await Role.findById(id);
    
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }
    
    // No permitir modificar el nombre de roles predeterminados
    if (role.isDefault && req.body.name && req.body.name.toLowerCase() !== role.name) {
      return res.status(400).json({ message: "Cannot change the name of default roles" });
    }
    
    // Actualizar permisos si se proporcionan
    if (permissions && Array.isArray(permissions)) {
      role.permissions = permissions.map(perm => ({ name: perm }));
    }
    
    if (req.body.name && !role.isDefault) {
      role.name = req.body.name.toLowerCase().trim();
    }
    
    await role.save();
    
    res.status(200).json({
      message: "Role updated successfully",
      role
    });
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).json({ message: "Error updating role" });
  }
};

// Eliminar un rol
export const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Encontrar el rol
    const role = await Role.findById(id);
    
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }
    
    // No permitir eliminar roles predeterminados
    if (role.isDefault) {
      return res.status(400).json({ message: "Cannot delete default roles" });
    }
    
    await Role.findByIdAndDelete(id);
    
    res.status(200).json({ message: "Role deleted successfully" });
  } catch (error) {
    console.error("Error deleting role:", error);
    res.status(500).json({ message: "Error deleting role" });
  }
};