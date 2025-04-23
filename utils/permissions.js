// utils/permissions.js
import Role from "../models/role.js";

// Lista completa de todos los permisos disponibles en el sistema
export const ALL_PERMISSIONS = [
  "view_roles", "view_roles_id", "create_roles", "update_roles", "delete_roles",
  "create_users", "view_users", "view_users_id", "update_users", "delete_users",
  "view_categories", "view_categories_id", "create_categories", "update_categories", "delete_categories",
  "view_products", "view_products_id", "create_products", "edit_products", "delete_products",
  "view_providers", "view_providers_id", "create_providers", "update_providers", "delete_providers",
  "view_purchases", "view_purchases_id", "create_purchases", "update_purchases", "delete_purchases",
  "view_branches", "create_branches", "update_branches", "delete_branches",
  "view_customers", "view_customers_id", "create_customers", "update_customers", "delete_customers",
  "view_sales", "view_sales_id", "create_sales", "update_sales", "delete_sales"
];

// Permisos por defecto para los roles predefinidos
const DEFAULT_PERMISSIONS = {
  admin: [
    "view_roles", "view_roles_id", "create_roles", "update_roles", "delete_roles", 
    "create_users", "view_users", "view_users_id", "update_users", "delete_users", "update_user_status",
    "view_categories", "view_categories_id", "create_categories", "update_categories", "delete_categories",
    "view_products", "view_products_id", "create_products", "edit_products", "delete_products",
    "view_providers", "view_providers_id", "create_providers", "update_providers", "delete_providers",
    "view_purchases", "view_purchases_id", "create_purchases", "update_purchases", "delete_purchases",
    "view_branches", "create_branches", "update_branches", "delete_branches", 
    "view_customers", "view_customers_id", "create_customers", "update_customers", "delete_customers",
    "view_sales", "view_sales_id", "create_sales", "update_sales", "delete_sales"
  ],
  assistant: [
    "view_roles", "create_users", "view_users", "view_users_id", "update_users",
    "view_categories", "view_categories_id","create_categories", "view_customers",
    "view_products", "view_products_id", "create_products", "edit_products", "delete_products",
    "view_providers", "view_providers_id", "create_providers", "update_providers",
    "view_purchases", "view_purchases_id", "create_purchases", "update_purchases",
    "view_customers", "view_customers_id", "create_customers", "update_customers",
    "view_sales", "view_sales_id", "view_sales", "view_sales_id", "create_sales", "update_sales"
  ],
  employee: [
    "view_categories", "view_products", "view_products_id","create_products", "edit_products", "delete_products",
     "view_customers", "view_sales", "view_customers_id", "create_sales", "update_sales"
  ]
};

// Función para obtener permisos predeterminados por nombre de rol
export const getDefaultPermissions = (roleName) => {
  return DEFAULT_PERMISSIONS[roleName] || [];
};

// Función actualizada para verificar permisos (versión asíncrona)
export const checkPermission = async (roleId, action) => {
  try {
    // Buscar el rol en la base de datos
    const role = await Role.findById(roleId);
    
    if (!role) {
      return false;
    }
    
    // Verificar en permisos predefinidos primero
    if (role.isDefault && DEFAULT_PERMISSIONS[role.name]) {
      const hasPermission = DEFAULT_PERMISSIONS[role.name].includes(action);
      return hasPermission;
    }
    
    // Verificar en permisos almacenados
    const hasPermission = role.permissions.some(permission => 
      typeof permission === 'string' ? permission === action : permission.name === action
    );
    return hasPermission;
  } catch (error) {
    return false;
  }
};

// Versión sincrónica para usar cuando ya tenemos el objeto de rol
export const checkPermissionSync = (role, action) => {
  
  // Si recibimos un objeto de rol completo
  if (typeof role === 'object' && role !== null) {
    // Verificar en permisos predefinidos primero si es un rol predeterminado
    if (role.isDefault && role.name && DEFAULT_PERMISSIONS[role.name]) {
      const hasDefaultPermission = DEFAULT_PERMISSIONS[role.name].includes(action);
      console.log("Verificando permisos predefinidos:", { 
        role: role.name, 
        action, 
        hasPermission: hasDefaultPermission 
      });
      return hasDefaultPermission;
    }
    
    // Verificar en permisos almacenados
    if (role.permissions && Array.isArray(role.permissions)) {
      const hasPermission = role.permissions.some(permission => 
        typeof permission === 'string' ? permission === action : permission.name === action
      );
      console.log("Verificando permisos del objeto:", { 
        role: role.name, 
        action, 
        hasPermission 
      });
      return hasPermission;
    }
    
    // Si llegamos aquí y no encontramos permisos, usar el nombre
    role = role.name;
  }
  
  // Si es un nombre de rol (string)
  if (typeof role === 'string' && DEFAULT_PERMISSIONS[role]) {
    const hasStringPermission = DEFAULT_PERMISSIONS[role].includes(action);
    console.log("Verificando permisos por nombre:", { 
      role, 
      action, 
      hasPermission: hasStringPermission 
    });
    return hasStringPermission;
  }
  
  console.log("No se encontró permiso para:", { role, action });
  return false;
};