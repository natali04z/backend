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
      minlength: [6, 'Password must be at least 6 characters long'],
      maxlength: [12, 'Password must be at most 12 characters long']
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