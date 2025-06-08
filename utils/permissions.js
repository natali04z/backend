import Role from "../models/role.js";
import Permission from "../models/permission.js";

// Lista completa de todos los permisos disponibles en el sistema (código en inglés)
export const ALL_PERMISSIONS = [
  // Roles
  "view_roles", "view_roles_id", "create_roles", "update_roles", "delete_roles", "update_role_status",

  // Users
  "create_users", "view_users", "view_users_id", "update_users", "delete_users", "update_user_status",

  // Categories
  "view_categories", "view_categories_id", "create_categories", "update_categories", "delete_categories", "update_status_categories",

  // Providers
  "view_providers", "view_providers_id", "create_providers", "update_providers", "delete_providers", "update_status_providers",

  // Products
  "view_products", "view_products_id", "create_products", "edit_products", "delete_products", "update_status_products", "update_stock_products",

  // Purchases
  "view_purchases", "view_purchases_id", "create_purchases", "delete_purchases", "update_status_purchases",  "reactivate_purchases",

  // Branches
  "view_branches", "create_branches", "update_branches", "delete_branches","update_status_branches","edit_branches",

  // Customers
  "view_customers", "view_customers_id", "create_customers", "update_customers", "delete_customers", "update_customers_status",

  // Sales
  "view_sales", "view_sales_id", "create_sales", "delete_sales", "update_status_sales",

  // Permissions
  "view_permissions", "view_permissions_id", "create_permissions", "update_permissions", "delete_permissions", "update_permission_status"
];

// Permisos por defecto para los roles predefinidos (usando códigos en inglés)
const DEFAULT_PERMISSIONS = {
  admin: [...ALL_PERMISSIONS], // El administrador tiene todos los permisos

  assistant: [
    "view_roles", "view_users", "view_users_id",
    "view_categories", "view_categories_id", "create_categories", "update_status_categories",
    "view_providers", "view_providers_id", "create_providers", "update_providers", "update_status_providers",
    "view_products", "view_products_id", "create_products", "edit_products", "delete_products", "update_status_products", "update_stock_products",
    "view_purchases", "view_purchases_id", "create_purchases", "update_status_purchases",
    "view_customers", "view_customers_id", "create_customers", "update_customers",
    "view_sales", "view_sales_id", "create_sales"
  ],

  employee: [
    "view_categories",
    "view_products", "view_products_id", "create_products", "edit_products", "delete_products", "update_status_products", "update_stock_products",
    "view_customers", "view_customers_id",
    "view_sales", "view_sales_id", "create_sales"
  ]
};

// Función para crear los permisos iniciales en la base de datos
export const createInitialPermissions = async () => {
  try {
    // Obtener la traducción de los permisos
    const codeToName = Permission.getCodeToNameTranslation();
    
    // Verificar si ya hay permisos en la base de datos
    const count = await Permission.countDocuments();
    if (count > 0) {
      return;
    }
    
    // Crear batch de permisos iniciales
    const initialPermissions = ALL_PERMISSIONS.map(code => ({
      code: code,
      name: codeToName[code] || code, // Usar la traducción en español, o el código si no hay traducción
      description: `Permiso para ${codeToName[code] || code}`,
      status: 'active'
    }));
    
    // Guardar todos los permisos en la base de datos
    await Permission.insertMany(initialPermissions);
  } catch (error) {
    console.error("Error al crear permisos iniciales:", error);
  }
};

// Obtener permisos por defecto según el nombre del rol (devuelve códigos en inglés)
export const getDefaultPermissions = (roleName) => {
  return DEFAULT_PERMISSIONS[roleName] || [];
};

// Verifica si un rol tiene cierto permiso (versión asíncrona con consulta a DB)
export const checkPermission = async (roleId, permissionCode) => {
  try {
    const role = await Role.findById(roleId).populate('permissions');
    if (!role) return false;

    // Si es un rol predeterminado, verificar en la configuración estática
    if (role.isDefault && DEFAULT_PERMISSIONS[role.name]) {
      return DEFAULT_PERMISSIONS[role.name].includes(permissionCode);
    }

    // Verificar si el rol tiene el permiso en su array de permisos
    if (role.permissions && role.permissions.length > 0) {
      return role.permissions.some(permission => 
        permission.code === permissionCode
      );
    }

    return false;
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
};

// Verifica permiso sincrónicamente si ya tienes el objeto de rol completo
export const checkPermissionSync = (role, permissionCode) => {
  if (role && typeof role === 'object') {
    if (role.isDefault && role.name && DEFAULT_PERMISSIONS[role.name]) {
      return DEFAULT_PERMISSIONS[role.name].includes(permissionCode);
    }

    // Verificar en el array de permisos del rol
    if (role.permissions && Array.isArray(role.permissions)) {
      return role.permissions.some(permission => {
        if (typeof permission === 'string') {
          return permission === permissionCode;
        }
        if (permission && typeof permission === 'object') {
          return permission.code === permissionCode;
        }
        return false;
      });
    }
  }

  // Si role es un string (nombre del rol)
  if (typeof role === 'string' && DEFAULT_PERMISSIONS[role]) {
    return DEFAULT_PERMISSIONS[role].includes(permissionCode);
  }

  return false;
};