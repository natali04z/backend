import mongoose from 'mongoose';

const BranchSchema = new mongoose.Schema({
  id: { type: String, unique: true }, // Campo personalizado para IDs como "Br01", "Br02"
  name: { type: String, required: true },
  location: { type: String, required: true }, // Agregado según tu controller
  address: { type: String, required: true },
  phone: { type: String, required: true },
  status: { type: String, enum: ["active", "inactive", "pending"], default: "active" }
});

export default mongoose.model('Branch', BranchSchema);