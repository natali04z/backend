import mongoose from "mongoose";
import Permission from "../models/permission.js";

// Función para generar ID de permiso (Pe01, Pe02, etc.)
async function generatePermissionId() {
  const lastPermission = await Permission.findOne().sort({ id: -1 });
  
  if (!lastPermission || !/^Pe\d{2}$/.test(lastPermission.id)) {
    return "Pe01";
  }
  
  const lastNumber = parseInt(lastPermission.id.substring(2), 10);
  const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
  return `Pe${nextNumber}`;
}

// Obtener todos los permisos
export const getPermissions = async (req, res) => {
  try {
    const permissions = await Permission.find();
    res.status(200).json({ permissions });
  } catch (error) {
    console.error("Error fetching permissions:", error);
    res.status(500).json({ message: "Error fetching permissions" });
  }
};

// Obtener un permiso por ID
export const getPermissionById = async (req, res) => {
  try {
    const { id } = req.params;
    const permission = await Permission.findById(id);
    
    if (!permission) {
      return res.status(404).json({ message: "Permission not found" });
    }
    
    res.status(200).json({ permission });
  } catch (error) {
    console.error("Error fetching permission:", error);
    res.status(500).json({ message: "Error fetching permission" });
  }
};

// Crear un nuevo permiso
export const postPermission = async (req, res) => {
  try {
    const { name, code, description } = req.body;

    if (!name || !code) {
      return res.status(400).json({ message: "Name and code are required" });
    }

    // Verificar si ya existe un permiso con este código
    const existingPermissionCode = await Permission.findOne({ code });
    if (existingPermissionCode) {
      return res.status(400).json({ message: "Permission already exists with this code" });
    }

    // Verificar si ya existe un permiso con este nombre en español
    const existingPermissionName = await Permission.findOne({ name });
    if (existingPermissionName) {
      return res.status(400).json({ message: "Permission already exists with this name" });
    }

    // Generar ID único para el permiso
    const permissionId = await generatePermissionId();

    // Crear nuevo permiso
    const newPermission = new Permission({
      id: permissionId,     // ID único generado automáticamente
      name,                 // Nombre en español
      code,                 // Código en inglés para el backend
      description: description || "",
    });

    await newPermission.save();
    res.status(201).json({ message: "Permission created successfully", permission: newPermission });
  } catch (error) {
    console.error("Error creating permission:", error);
    res.status(500).json({ message: "Error creating permission" });
  }
};

// Actualizar un permiso existente
export const updatePermission = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description } = req.body;

    const permission = await Permission.findById(id);

    if (!permission) {
      return res.status(404).json({ message: "Permission not found" });
    }

    // Si se está cambiando el nombre, verificar que no exista otro con ese nombre
    if (name && name !== permission.name) {
      const existingName = await Permission.findOne({ name });
      if (existingName) {
        return res.status(400).json({ message: "Another permission already exists with this name" });
      }
    }

    // Si se está cambiando el código, verificar que no exista otro con ese código
    if (code && code !== permission.code) {
      const existingCode = await Permission.findOne({ code });
      if (existingCode) {
        return res.status(400).json({ message: "Another permission already exists with this code" });
      }
    }

    // Actualizar los campos
    permission.name = name || permission.name;
    permission.code = code || permission.code;
    permission.description = description || permission.description;

    await permission.save();
    res.status(200).json({ message: "Permission updated successfully", permission });
  } catch (error) {
    console.error("Error updating permission:", error);
    res.status(500).json({ message: "Error updating permission" });
  }
};

// Eliminar un permiso
export const deletePermission = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Permission.findByIdAndDelete(id);
    
    if (!result) {
      return res.status(404).json({ message: "Permission not found" });
    }

    res.status(200).json({ message: "Permission deleted successfully" });
  } catch (error) {
    console.error("Error deleting permission:", error);
    res.status(500).json({ message: "Error deleting permission" });
  }
};

// Cambiar el estado de un permiso (active/inactive)
export const togglePermissionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validar que el estado sea uno de los valores permitidos
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Status must be either 'active' or 'inactive'" });
    }

    const permission = await Permission.findById(id);

    if (!permission) {
      return res.status(404).json({ message: "Permission not found" });
    }

    // Actualizar el estado del permiso
    permission.status = status;

    await permission.save();

    res.status(200).json({
      message: `Permission status updated to '${status}' successfully`,
      permission
    });
  } catch (error) {
    console.error("Error updating permission status:", error);
    res.status(500).json({ message: "Error updating permission status" });
  }
};