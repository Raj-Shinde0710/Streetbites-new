require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");

const connectDB = require("./utils/dbConnect");
const { classifyDatabaseError } = require("./utils/dbConnect");
const donationRoutes = require("./routes/donationRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { attachUser } = require("./middleware/authMiddleware");
require("./utils/storage"); // Initialize storage & sync listeners

const app = express();

// Trust Vercel reverse proxy for secure cookies over HTTPS
app.set("trust proxy", 1);

// Configure View Engine & Paths for Vercel Serverless environment
app.set("view engine", "ejs");
app.set("views", [
  path.join(process.cwd(), "views"),
  path.join(__dirname, "views")
]);

// Body Parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static Files Fallback
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.static(path.join(__dirname, "public")));

// Configure Mongoose global behavior
mongoose.set("bufferTimeoutMS", 3000);

// Session Store Configuration
const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const sessionSecret = process.env.SESSION_SECRET || "streetbites_secure_production_secret_key_2026";
const mongoURI = process.env.MONGODB_URI;

let sessionStore;
if (mongoURI && !mongoURI.includes("<db_password>") && !mongoURI.includes("<password>")) {
  try {
    sessionStore = MongoStore.create({
      clientPromise: connectDB().then((m) => m.connection.getClient()),
      collectionName: "sessions",
      ttl: 24 * 60 * 60 // 1 day
    });

    sessionStore.on("error", (err) => {
      console.warn("⚠️  [Session Store Warning]:", err.message);
    });
  } catch (storeErr) {
    console.error("⚠️  [Session Store Init Error]:", storeErr.message);
  }
} else if (!isProduction) {
  try {
    sessionStore = MongoStore.create({
      mongoUrl: "mongodb://127.0.0.1:27017/streetbitesDB",
      collectionName: "sessions",
      ttl: 24 * 60 * 60
    });
    sessionStore.on("error", (err) => {
      console.warn("⚠️  [Local Session Store Warning]:", err.message);
    });
  } catch (localStoreErr) {
    console.warn("⚠️  [Local Session Store Notice]:", localStoreErr.message);
  }
}

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
  })
);

// Global context middleware (makes currentUser, isAdmin, and alerts available in all views)
app.use(attachUser);

// Production Diagnostics: Health & Database Diagnostic Endpoint (Step 3)
app.get("/api/health", async (req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  let dbState = states[mongoose.connection.readyState] || "unknown";
  let diagnostic = null;

  // If disconnected, test connection on-demand to diagnose
  if (mongoose.connection.readyState !== 1) {
    try {
      await connectDB();
      dbState = "connected";
    } catch (err) {
      dbState = "disconnected";
      diagnostic = classifyDatabaseError(err, process.env.MONGODB_URI);
    }
  }

  const isConfigured = Boolean(process.env.MONGODB_URI);
  let uriScheme = "none";
  let clusterHost = "none";
  let dbName = "none";

  if (isConfigured) {
    const raw = process.env.MONGODB_URI.trim();
    uriScheme = raw.startsWith("mongodb+srv://") ? "mongodb+srv" : raw.startsWith("mongodb://") ? "mongodb" : "other";
    const hostMatch = raw.match(/@([^/?]+)/);
    if (hostMatch) clusterHost = hostMatch[1];
    const dbMatch = raw.match(/@(?:[^/?]+)\/([^?]+)/);
    if (dbMatch) dbName = dbMatch[1];
  }

  res.status(200).json({
    status: "ok",
    database: dbState,
    environment: process.env.NODE_ENV || (process.env.VERCEL ? "production" : "development"),
    mongodb: {
      configured: isConfigured,
      scheme: uriScheme,
      cluster: clusterHost,
      databaseName: dbName,
      hasPlaceholder: isConfigured && (process.env.MONGODB_URI.includes("<db_password>") || process.env.MONGODB_URI.includes("<password>"))
    },
    diagnostic,
    timestamp: new Date().toISOString()
  });
});

// Database Connection Middleware: Ensure database is ready before executing dynamic routes
app.use(async (req, res, next) => {
  // Allow health check and static assets without requiring active DB connection
  if (
    req.path === "/api/health" ||
    req.path === "/style.css" ||
    req.path === "/favicon.ico" ||
    req.path.endsWith(".png") ||
    req.path.endsWith(".jpg") ||
    req.path.endsWith(".svg") ||
    req.path.endsWith(".css") ||
    req.path.endsWith(".js")
  ) {
    return next();
  }

  try {
    await connectDB();
    next();
  } catch (err) {
    console.error(`[DB Middleware] Connection failed for ${req.method} ${req.path}:`, err.name, err.message);
    const diag = classifyDatabaseError(err, process.env.MONGODB_URI);
    return res.status(diag.statusCode).render("db_error", {
      title: diag.title,
      category: diag.category,
      message: diag.message,
      action: diag.action
    });
  }
});

// Application Routes
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

// Centralized Production Error Handler
app.use((err, req, res, next) => {
  console.error(`[Server Error] [${req.method} ${req.path}]:`, err.message);
  res.status(err.status || 500).send(`
    <div style="font-family:sans-serif; max-width:600px; margin:80px auto; padding:30px; text-align:center; border:1px solid #e2e8f0; border-radius:12px;">
      <h2 style="color:#e11d48;">Application Error</h2>
      <p style="color:#64748b;">${err.message || "An unexpected error occurred while processing your request."}</p>
      <a href="/" style="display:inline-block; margin-top:20px; background:#2563eb; color:#fff; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600;">Return to Home</a>
    </div>
  `);
});

// Start HTTP server only for local development (not inside Vercel serverless functions)
if (require.main === module && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running locally on http://localhost:${PORT}`);
    console.log(`🔒 Admin Portal available at http://localhost:${PORT}/admin/login`);
    console.log(`🩺 Health check at http://localhost:${PORT}/api/health`);
  });
}

// Export Express application for Vercel Serverless Function runtime
module.exports = app;
