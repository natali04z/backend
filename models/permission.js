import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
},);

// Método para obtener la traducción español-inglés de los permisos
permissionSchema.statics.getPermissionTranslation = function() {
  return {
    // Roles
    "Ver roles": "view_roles",
    "Ver rol por ID": "view_roles_id",
    "Crear roles": "create_roles",
    "Actualizar roles": "update_roles",
    "Eliminar roles": "delete_roles",
    "Activar/Desactivar roles": "update_role_status",

    // Usuarios
    "Crear usuarios": "create_users",
    "Ver usuarios": "view_users",
    "Ver usuario por ID": "view_users_id",
    "Actualizar usuarios": "update_users",
    "Eliminar usuarios": "delete_users",
    "Activar/Desactivar usuarios": "update_user_status",

    // Categorías
    "Ver categorías": "view_categories",
    "Ver categoría por ID": "view_categories_id",
    "Crear categorías": "create_categories",
    "Actualizar categorías": "update_categories",
    "Eliminar categorías": "delete_categories",
    "Activar/Desactivar categorías": "update_status_categories",

    // Proveedores
    "Ver proveedores": "view_providers",
    "Ver proveedor por ID": "view_providers_id",
    "Crear proveedores": "create_providers",
    "Actualizar proveedores": "update_providers",
    "Eliminar proveedores": "delete_providers",
    "Activar/Desactivar proveedores": "update_status_providers",

    // Productos
    "Ver productos": "view_products",
    "Ver producto por ID": "view_products_id",
    "Crear productos": "create_products",
    "Editar productos": "edit_products",
    "Eliminar productos": "delete_products",
    "Activar/Desactivar productos": "update_status_products",
    "Actualizar stock de productos": "update_stock_products",

    // Compras
    "Ver compras": "view_purchases",
    "Ver compra por ID": "view_purchases_id",
    "Crear compras": "create_purchases",
    "Actualizar compras": "update_purchases",
    "Eliminar compras": "delete_purchases",
    "update_status_purchases": "Desactivar estado de compras",
    "reactivate_purchases": "Reactivar estado de Compra",

    // Sucursales
    "Ver sucursales": "view_branches",
    "Crear sucursales": "create_branches",
    "Actualizar sucursales": "update_branches",
    "Eliminar sucursales": "delete_branches",

    // Clientes
    "Ver clientes": "view_customers",
    "Ver cliente por ID": "view_customers_id",
    "Crear clientes": "create_customers",
    "Actualizar clientes": "update_customers",
    "Eliminar clientes": "delete_customers",
    "Activar/Desactivar clientes": "update_customers_status",

    // Ventas
    "Ver ventas": "view_sales",
    "Ver venta por ID": "view_sales_id",
    "Crear ventas": "create_sales", 
    "Actualizar ventas": "update_sales",
    "Eliminar ventas": "delete_sales",

    // Permisos
    "Ver permisos": "view_permissions",
    "Ver permiso por ID": "view_permissions_id",
    "Crear permisos": "create_permissions",
    "Actualizar permisos": "update_permissions",
    "Eliminar permisos": "delete_permissions",
    "Activar/Desactivar permisos": "update_permission_status"
  };
};

// Método inverso para obtener la traducción inglés-español
permissionSchema.statics.getCodeToNameTranslation = function() {
  const nameToCode = this.getPermissionTranslation();
  const codeToName = {};
  
  for (const [name, code] of Object.entries(nameToCode)) {
    codeToName[code] = name;
  }
  
  return codeToName;
};

export default mongoose.model('Permission', permissionSchema);