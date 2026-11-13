require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");

const donationRoutes = require("./routes/donationRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { attachUser } = require("./middleware/authMiddleware");
const seedAdmin = require("./utils/seedAdmin");
require("./utils/storage"); // Initialize storage & sync listeners

const app = express();

// View engine
app.set("view engine", "ejs");

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

// Configure Mongoose options
mongoose.set("bufferTimeoutMS", 2000);

// MongoDB connection
const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/streetbitesDB";

if (mongoURI.includes("<db_password>") || mongoURI.includes("<password>")) {
  console.warn("\n⚠️  [MongoDB Setup Notice]: Your MONGODB_URI in .env still contains '<db_password>'.");
  console.warn("   Replace '<db_password>' with your actual MongoDB Atlas user password in .env.");
  console.warn("   Until then, donations will automatically be preserved in local backup (data/donations.json) and synced once connected.\n");
} else {
  mongoose.connect(mongoURI)
    .then(() => {
      console.log("✅ MongoDB Connected Successfully");
      seedAdmin(); // Seed default administrator account if needed
    })
    .catch(err => console.warn("⚠️  MongoDB connection warning:", err.message));
}

// Session configuration with MongoDB session store
const sessionSecret = process.env.SESSION_SECRET || "streetbites_secure_production_secret_key_2026";
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: mongoURI,
      collectionName: "sessions",
      ttl: 24 * 60 * 60 // 1 day
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
  })
);

// Global context middleware (makes currentUser, isAdmin, and alert messages available in all views)
app.use(attachUser);

// Routes
app.use("/", authRoutes);
app.use("/", donationRoutes);
app.use("/admin", adminRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).render("admin/forbidden", {
    title: "Page Not Found - StreetBites",
    message: `The requested path '${req.path}' was not found on this server.`
  });
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  console.error("[Server Error]:", err);
  res.status(err.status || 500).send(`
    <div style="font-family:sans-serif; max-width:600px; margin:80px auto; padding:30px; text-align:center; border:1px solid #e2e8f0; border-radius:12px;">
      <h2 style="color:#e11d48;">Application Error</h2>
      <p style="color:#64748b;">${err.message || "An unexpected error occurred."}</p>
      <a href="/" style="display:inline-block; margin-top:20px; background:#2563eb; color:#fff; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600;">Return to Home</a>
    </div>
  `);
});

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔒 Admin Portal available at http://localhost:${PORT}/admin/login`);
});
