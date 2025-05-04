import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  status: { type: String, enum: ["active", "inactive"], default: "active" }
});

export default mongoose.model("Category", CategorySchema);
