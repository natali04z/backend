import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  lastname: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, unique: true, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
});

export default mongoose.model("Customer", CustomerSchema);