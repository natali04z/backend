import mongoose from "mongoose";

const providerSchema = new mongoose.Schema({
    id: { type: String, unique: true }, 
    nit: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    name: { type: String, required: true },
    contact_phone: { type: Number, required: true },
    email: { type: String, required: true, unique: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" }
});

export default mongoose.model("Provider", providerSchema);