const mongoose = require("mongoose");
const seedAdmin = require("./seedAdmin");

/**
 * Global cache across serverless warm invocations
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    if (isProduction) {
      console.error("❌ [Database Error]: MONGODB_URI is not set. Configure it in Vercel Project Settings -> Environment Variables.");
      throw new Error("MONGODB_URI environment variable is missing.");
    }
    console.warn("⚠️  [Database Warning]: MONGODB_URI is not set. Falling back to local MongoDB for development.");
  } else if (mongoURI.includes("<db_password>") || mongoURI.includes("<password>")) {
    console.error("❌ [Database Error]: MONGODB_URI contains placeholder '<db_password>'. Please replace it with your actual password in Vercel.");
    throw new Error("MONGODB_URI contains placeholder '<db_password>'.");
  }

  const targetURI = mongoURI || "mongodb://127.0.0.1:27017/streetbitesDB";

  // If already connected and ready, return existing connection
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
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
        console.error("❌ [Database Connection Error]:", err.message);
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

