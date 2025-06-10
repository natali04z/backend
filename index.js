import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import "dotenv/config";

import userRoutes from "./routes/user.routes.js";
import roleRoutes from "./routes/role.routes.js";
import authRoutes from "./routes/auth.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import productRoutes from "./routes/product.routes.js";
import providerRoutes from "./routes/provider.routes.js";
import purchaseRoutes from "./routes/purchase.routes.js";
import salesRoutes from './routes/sales.routes.js';
import customerRoutes from "./routes/customer.routes.js";
import branchesRoutes from "./routes/branches.routes.js";
import permissionRoutes from "./routes/permission.routes.js";
import dashboardRoutes from './routes/dashboard.routes.js';

import { createInitialPermissions } from "./utils/permissions.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/branches", branchesRoutes);
app.use("/api/permissions", permissionRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

export default app;