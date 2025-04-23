import mongoose from "mongoose";

const providerSchema = new mongoose.Schema({
    id: { type: String, unique: true }, 
    name: { type: String, required: true, trim: true },
    contact_number: { type: Number, required: true },
    address: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    personal_phone: { type: Number, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" }
});

export default mongoose.model("Provider", providerSchema);