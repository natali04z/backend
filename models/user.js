import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: String,
    lastname: String,
    contact_number: {
      type: String,
      match: [/^\d+$/, 'Only digits are allowed']
    },
    email: { 
      type: String, 
      unique: true 
    },
    password: {
      type: String,
      required: true
    },
    role: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Role"
    },
    status: { 
      type: String, 
      enum: ['active', 'inactive'], 
      default: 'active' 
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date
});

export default mongoose.model("User", userSchema);