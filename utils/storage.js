const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// Determine writable directory (Vercel serverless filesystem is read-only except /tmp)
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isServerless ? path.join("/tmp", "streetbites-data") : path.join(__dirname, "..", "data");
const STORAGE_FILE = path.join(DATA_DIR, "donations.json");

// Ensure data folder exists safely
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn("[Storage Notice]: Writable data directory could not be created:", err.message);
}

// Map model names to model instances
const models = {
  IndividualDonation: require("../models/IndividualDonation"),
  OrganizationDonation: require("../models/OrganizationDonation"),
  IndividualClothesDonation: require("../models/IndividualClothesDonation"),
  OrganizationClothesDonation: require("../models/OrganizationClothesDonation"),
  IndividualMoneyDonation: require("../models/IndividualMoneyDonation"),
  OrganizationMoneyDonation: require("../models/OrganizationMoneyDonation")
};

function readLocalDonations() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    console.warn("[Storage] Notice: Could not read local donations:", err.message);
    return [];
  }
}

function writeLocalDonations(donations) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(donations, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Storage] Notice: Could not write local donations backup:", err.message);
  }
}

function saveLocal(modelName, data, synced = false) {
  try {
    const donations = readLocalDonations();
    const entry = {
      id: "loc_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
      modelName,
      data,
      synced,
      createdAt: new Date().toISOString()
    };
    donations.push(entry);
    writeLocalDonations(donations);
    console.log(`[Storage] Saved ${modelName} to local storage (${synced ? 'synced' : 'pending sync'})`);
    return entry;
  } catch (err) {
    console.warn("[Storage] Warning: Local storage write failed:", err.message);
    return {
      id: "loc_" + Date.now(),
      modelName,
      data,
      synced,
      createdAt: new Date().toISOString()
    };
  }
}

/**
 * Saves a donation to MongoDB if connected, or to local JSON storage if offline / credentials pending.
 */
async function saveDonation(modelName, docData) {
  const Model = models[modelName];
  if (!Model) {
    throw new Error(`Unknown donation model: ${modelName}`);
  }

  // If MongoDB is connected, save directly to DB
  if (mongoose.connection.readyState === 1) {
    try {
      const doc = new Model(docData);
      const savedDoc = await doc.save();
      console.log(`[Storage] Saved ${modelName} to MongoDB Atlas successfully.`);
      try {
        saveLocal(modelName, docData, true);
      } catch (localErr) {
        // Safe to ignore local file errors if DB save succeeded
      }
      return { success: true, source: "mongodb", doc: savedDoc };
    } catch (err) {
      console.warn(`[Storage] MongoDB save failed: ${err.message}. Falling back to local storage.`);
    }
  } else {
    console.warn(`[Storage] MongoDB is not connected (state: ${mongoose.connection.readyState}). Storing locally.`);
  }

  // Fallback to local storage
  const entry = saveLocal(modelName, docData, false);
  return { success: true, source: "local", doc: entry };
}

/**
 * Syncs any pending local records to MongoDB when connection is established.
 */
async function syncPendingDonations() {
  if (mongoose.connection.readyState !== 1) return;

  const donations = readLocalDonations();
  const pending = donations.filter(d => !d.synced);
  if (pending.length === 0) return;

  console.log(`[Storage] Syncing ${pending.length} offline donation(s) to MongoDB...`);
  let syncedCount = 0;

  for (const item of donations) {
    if (!item.synced && models[item.modelName]) {
      try {
        const Model = models[item.modelName];
        await new Model(item.data).save();
        item.synced = true;
        syncedCount++;
      } catch (err) {
        console.error(`[Storage] Failed to sync item ${item.id}:`, err.message);
      }
    }
  }

  writeLocalDonations(donations);
  console.log(`[Storage] Successfully synced ${syncedCount} donation(s) to MongoDB.`);
}

// Automatically sync when MongoDB connects
mongoose.connection.on("connected", () => {
  console.log("[Storage] MongoDB connected event received. Triggering sync...");
  syncPendingDonations().catch(err => console.error("[Storage] Sync error:", err));
});

module.exports = {
  saveDonation,
  syncPendingDonations,
  readLocalDonations
};
