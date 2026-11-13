require("dotenv").config();
const mongoose = require("mongoose");
const seedAdmin = require("../utils/seedAdmin");

async function run() {
  const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/streetbitesDB";
  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoURI);
  console.log("Connected. Seeding admin account...");
  await seedAdmin();
  console.log("Done.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Failed to seed admin:", err);
  process.exit(1);
});

