import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: String,
    lastname: String,
    contact_number: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: mongoose.Schema.Types.ObjectId, ref: "Role"},
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
});

export default mongoose.model("User", userSchema);
