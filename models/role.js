import mongoose from "mongoose";

const RoleSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, unique: true, trim: true, lowercase: true },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission'}],
  isDefault: { type: Boolean, default: false } // Añadido porque se usa en los controladores
}, {
  // Estas son opciones del esquema, deben ir en el segundo argumento
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

RoleSchema.statics.getDefaultRoles = function() {
  return ["admin", "assistant", "employee"];
};

RoleSchema.virtual('displayName').get(function() {
  const translations = {
    'admin': 'Administrador',
    'assistant': 'Asistente',
    'employee': 'Empleado'
  };
  return translations[this.name] || this.name;
});

export default mongoose.model("Role", RoleSchema);