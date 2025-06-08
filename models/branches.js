import mongoose from 'mongoose';

const BranchSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: { type: String, required: true },
  location: { type: String, required: true }, 
  address: { type: String, required: true },
  phone: { type: String, required: true },
  status: { type: String, enum: ["active", "inactive", "pending"], default: "active" }
});

export default mongoose.model('Branch', BranchSchema);