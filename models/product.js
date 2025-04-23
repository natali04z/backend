import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
  provider: { type: mongoose.Schema.Types.ObjectId, ref: "Provider", required: true },
  price: { type: Number, required: true },
  batchDate: { type: Date, required: true, get: function(date) { return date ? date.toISOString().split('T')[0] : null;}},
  expirationDate: { type: Date, required: true, get: function(date) { return date ? date.toISOString().split('T')[0] : null;}},
  stock: { type: Number, required: true },
  minimumStock: { type: Number, required: true },
  status: { type: String, enum: ["active", "inactive"], default: "active" }
});

export default mongoose.model("Product", ProductSchema);