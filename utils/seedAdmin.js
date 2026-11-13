const User = require("../models/User");

async function seedAdmin() {
  try {
    const adminUsername = (process.env.ADMIN_USERNAME || "admin").toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD || "Admin@StreetBites2026";
    const adminEmail = (process.env.ADMIN_EMAIL || "admin@streetbites.org").toLowerCase().trim();

    // Check if an admin user already exists
    const existingAdmin = await User.findOne({
      $or: [{ role: "admin" }, { username: adminUsername }]
    });

    if (existingAdmin) {
      if (existingAdmin.role !== "admin") {
        existingAdmin.role = "admin";
        await existingAdmin.save();
        console.log(`[Admin Seed] Elevated existing user '${existingAdmin.username}' to admin.`);
      } else {
        console.log(`[Admin Seed] Admin account '${existingAdmin.username}' already configured.`);
      }
      return;
    }

    // Create initial admin account
    const newAdmin = new User({
      fullName: "StreetBites Administrator",
      username: adminUsername,
      email: adminEmail,
      mobile: "9999999999",
      password: adminPassword, // will be hashed by pre-save hook in User model
      role: "admin"
    });

    await newAdmin.save();
    console.log(`[Admin Seed] ✅ Initial administrator account created successfully!`);
    console.log(`   Username: ${adminUsername}`);
    console.log(`   Role: admin`);
  } catch (err) {
    console.error("[Admin Seed Error]:", err.message);
  }
}

module.exports = seedAdmin;

