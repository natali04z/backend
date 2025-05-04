import mongoose from "mongoose";

const providerSchema = new mongoose.Schema({
    id: { type: String, unique: true }, 
    nit: { 
        type: String, 
        required: true, 
        trim: true,
        validate: {
            validator: function(v) {
                return /^\d+$/.test(v);
            },
            message: props => `${props.value} Only digits are allowed for NIT`
        }
    },
    company: { type: String, required: true, trim: true },
    name: { type: String, required: true },
    contact_phone: { 
        type: String,
        required: true,
        validate: {
            validator: function(v) {
                return /^\d+$/.test(v);
            },
            message: props => `${props.value} Only digits are allowed`
        }
    },
    email: { type: String, required: true, unique: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" }
});

export default mongoose.model("Provider", providerSchema);