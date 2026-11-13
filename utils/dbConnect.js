const mongoose = require("mongoose");
const seedAdmin = require("./seedAdmin");

/**
 * Global cache across serverless warm invocations
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * Classifies database connection errors into clear categories with actionable steps
 */
function classifyDatabaseError(err, mongoURI) {
  if (!mongoURI) {
    return {
      category: "MISSING_MONGODB_URI",
      statusCode: 503,
      title: "MongoDB URI Not Configured",
      message: "The MONGODB_URI environment variable is not configured in Vercel Project Settings.",
      action: "Go to your Vercel Dashboard → Project Settings → Environment Variables and add MONGODB_URI."
    };
  }

  if (mongoURI.includes("<db_password>") || mongoURI.includes("<password>")) {
    return {
      category: "PLACEHOLDER_IN_URI",
      statusCode: 503,
      title: "Password Placeholder Detected",
      message: "Your MONGODB_URI contains '<db_password>'. It must be replaced with your actual database user password.",
      action: "Update MONGODB_URI in Vercel with your actual MongoDB Atlas database password."
    };
  }

  // Check for multiple '@' characters (unencoded special char in password)
  const atCount = (mongoURI.match(/@/g) || []).length;
  if (atCount > 1) {
    return {
      category: "UNENCODED_PASSWORD",
      statusCode: 503,
      title: "Unencoded Special Character in Password",
      message: "Your MONGODB_URI contains multiple '@' characters. Special characters in the password must be URL-encoded (e.g. '@' becomes '%40').",
      action: "Replace any '@' inside your password with '%40' in your Vercel MONGODB_URI variable."
    };
  }

  const msg = (err && err.message) || "";
  const name = (err && err.name) || "";

  // Authentication Failure
  if (
    msg.toLowerCase().includes("auth failed") ||
    msg.toLowerCase().includes("authentication failed") ||
    msg.toLowerCase().includes("bad auth") ||
    (name === "MongoServerError" && msg.includes("Authentication"))
  ) {
    return {
      category: "AUTHENTICATION_FAILED",
      statusCode: 503,
      title: "MongoDB Authentication Failed",
      message: "Authentication failed for database user. The username or password in MONGODB_URI is incorrect.",
      action: "Verify the database user credentials in MongoDB Atlas (Database Access) and ensure special characters are URL-encoded."
    };
  }

  // IP Access Denied / Network Firewall
  if (
    name === "MongoServerSelectionError" ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("Could not connect to any servers in your MongoDB Atlas cluster") ||
    msg.includes("connection closed") ||
    msg.includes("topology was destroyed")
  ) {
    return {
      category: "IP_ACCESS_DENIED_OR_NETWORK",
      statusCode: 503,
      title: "MongoDB Atlas Network / IP Access Blocked",
      message: "Vercel serverless functions cannot connect to MongoDB Atlas because IP access is restricted.",
      action: "In MongoDB Atlas Dashboard → Network Access, click 'Add IP Address' and choose 'Allow Access From Anywhere' (0.0.0.0/0)."
    };
  }

  // DNS Resolution Error
  if (
    msg.includes("ENOTFOUND") ||
    msg.includes("querySrv") ||
    msg.includes("getaddrinfo")
  ) {
    return {
      category: "DNS_RESOLUTION_ERROR",
      statusCode: 503,
      title: "DNS Resolution Error",
      message: "Unable to resolve the MongoDB Atlas cluster hostname from MONGODB_URI.",
      action: "Check the cluster hostname in your MONGODB_URI (e.g. cluster0.xxxx.mongodb.net)."
    };
  }

  // TLS / SSL Error
  if (
    msg.toLowerCase().includes("tls") ||
    msg.toLowerCase().includes("ssl") ||
    msg.toLowerCase().includes("certificate")
  ) {
    return {
      category: "TLS_SSL_ERROR",
      statusCode: 503,
      title: "TLS / SSL Handshake Error",
      message: "TLS/SSL negotiation with MongoDB Atlas failed.",
      action: "Verify Node.js TLS support or check TLS settings in MongoDB Atlas."
    };
  }

  // Connection Timeout
  if (
    msg.toLowerCase().includes("timeout") ||
    msg.toLowerCase().includes("timed out")
  ) {
    return {
      category: "CONNECTION_TIMEOUT",
      statusCode: 504,
      title: "MongoDB Connection Timeout",
      message: "Connecting to MongoDB Atlas exceeded the timeout limit.",
      action: "Ensure your MongoDB Atlas cluster is running and Network Access allows 0.0.0.0/0."
    };
  }

  // Invalid URI format
  if (
    msg.toLowerCase().includes("invalid scheme") ||
    msg.toLowerCase().includes("must begin with") ||
    msg.toLowerCase().includes("invalid connection string")
  ) {
    return {
      category: "INVALID_CONNECTION_URI",
      statusCode: 503,
      title: "Invalid MongoDB Connection URI",
      message: "The format of MONGODB_URI is invalid.",
      action: "Ensure your connection string starts with 'mongodb+srv://' or 'mongodb://'."
    };
  }

  return {
    category: "DATABASE_CONNECTION_ERROR",
    statusCode: 503,
    title: "Database Unavailable",
    message: msg || "Could not establish connection to MongoDB Atlas.",
    action: "Check your MongoDB Atlas cluster status and Vercel environment variables."
  };
}

async function connectDB() {
  const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    if (isProduction) {
      console.error("❌ [Database Error]: MONGODB_URI environment variable is missing in Vercel.");
      const err = new Error("MONGODB_URI environment variable is missing.");
      err.name = "MissingMongoURIError";
      throw err;
    }
    console.warn("⚠️  [Database Warning]: MONGODB_URI is not set. Defaulting to local MongoDB for development.");
  } else if (mongoURI.includes("<db_password>") || mongoURI.includes("<password>")) {
    console.error("❌ [Database Error]: MONGODB_URI contains placeholder '<db_password>'.");
    const err = new Error("MONGODB_URI contains placeholder '<db_password>'.");
    err.name = "PlaceholderPasswordError";
    throw err;
  }

  const targetURI = mongoURI || "mongodb://127.0.0.1:27017/streetbitesDB";

  // If already connected and ready, return existing connection immediately
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000, // 10s for serverless SRV DNS + TLS handshake
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      family: 4 // IPv4 to avoid AWS Lambda IPv6 DNS resolution delays
    };

    console.log("[Database] Connecting to MongoDB Atlas...");
    cached.promise = mongoose.connect(targetURI, opts)
      .then(async (m) => {
        console.log("✅ [Database] MongoDB Atlas Connected Successfully");
        try {
          await seedAdmin();
        } catch (seedErr) {
          console.warn("[Admin Seed Notice]:", seedErr.message);
        }
        return m;
      })
      .catch((err) => {
        cached.promise = null;
        console.error("❌ [Database Connection Error]:", err.name, err.message);
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

module.exports = connectDB;
module.exports.classifyDatabaseError = classifyDatabaseError;
