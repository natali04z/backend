import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  }
});

const RoleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  status: {
    type: Boolean,
    default: false
  },
  permissions: [permissionSchema]
}, { timestamps: true });

// Método estático para obtener roles predeterminados
RoleSchema.statics.getDefaultRoles = function() {
  return ["admin", "assistant", "employee"];
};

const Role = mongoose.model("Role", RoleSchema);
export default Role;