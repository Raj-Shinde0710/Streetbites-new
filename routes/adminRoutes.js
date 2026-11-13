const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { isAdmin } = require("../middleware/adminMiddleware");
const { authLimiter } = require("../middleware/rateLimiter");
const {
  getDashboardStats,
  getAllUnifiedDonations,
  getDonationById,
  updateDonationStatus,
  getUserDonations
} = require("../utils/donationService");

// -------------------------------------------------------------
// Root Redirect
// -------------------------------------------------------------
router.get("/", (req, res) => {
  res.redirect("/admin/dashboard");
});

// -------------------------------------------------------------
// Admin Login / Logout
// -------------------------------------------------------------
router.get("/login", (req, res) => {
  if (req.session && req.session.user && req.session.user.role === "admin") {
    return res.redirect("/admin/dashboard");
  }
  res.render("admin/login", {
    title: "Administrator Portal - StreetBites",
    usernameVal: ""
  });
});

router.post("/login", authLimiter, async (req, res) => {
  const { username, password } = req.body;
  const usernameVal = (username || "").trim();

  try {
    if (!usernameVal || !password) {
      return res.render("admin/login", {
        title: "Administrator Portal - StreetBites",
        error: "Please enter your administrator username and password.",
        usernameVal
      });
    }

    const cleanInput = usernameVal.toLowerCase();

    // Look for user by username or email
    const user = await User.findOne({
      $or: [{ username: cleanInput }, { email: cleanInput }]
    });

    if (!user) {
      return res.render("admin/login", {
        title: "Administrator Portal - StreetBites",
        error: "Invalid administrator credentials.",
        usernameVal
      });
    }

    // Role check: Only admin role can authenticate here
    if (user.role !== "admin") {
      return res.render("admin/login", {
        title: "Administrator Portal - StreetBites",
        error: "Access denied: Account does not have administrator privileges.",
        usernameVal
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.render("admin/login", {
        title: "Administrator Portal - StreetBites",
        error: "Invalid administrator credentials.",
        usernameVal
      });
    }

    // Regenerate session for security
    req.session.regenerate((err) => {
      if (err) {
        console.error("[Admin Session Error]:", err);
        return res.redirect("/admin/login?error=" + encodeURIComponent("Login failed."));
      }

      req.session.user = {
        id: user._id.toString(),
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        mobile: user.mobile,
        role: "admin"
      };

      return res.redirect("/admin/dashboard");
    });
  } catch (err) {
    console.error("[Admin Login Error]:", err);
    return res.render("admin/login", {
      title: "Administrator Portal - StreetBites",
      error: "An unexpected error occurred. Please try again.",
      usernameVal
    });
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("[Admin Logout Error]:", err);
    res.clearCookie("connect.sid");
    res.redirect("/admin/login?success=" + encodeURIComponent("Administrator logged out successfully."));
  });
});

// -------------------------------------------------------------
// Admin Dashboard Overview
// -------------------------------------------------------------
router.get("/dashboard", isAdmin, async (req, res) => {
  try {
    const stats = await getDashboardStats();
    const recent = await getAllUnifiedDonations({ limit: 6, sort: "newest" });

    res.render("admin/dashboard", {
      title: "Admin Dashboard - StreetBites",
      activePage: "dashboard",
      stats,
      recentDonations: recent.donations
    });
  } catch (err) {
    console.error("[Admin Dashboard Error]:", err);
    res.status(500).send("Error loading admin dashboard: " + err.message);
  }
});

// -------------------------------------------------------------
// Unified Donations Management
// -------------------------------------------------------------
router.get("/donations", isAdmin, async (req, res) => {
  try {
    const {
      category = "all",
      donorType = "all",
      status = "all",
      search = "",
      sort = "newest",
      page = 1
    } = req.query;

    const data = await getAllUnifiedDonations({
      category,
      donorType,
      status,
      search,
      sort,
      page: parseInt(page, 10) || 1,
      limit: 10
    });

    res.render("admin/donations", {
      title: "Donation Management - StreetBites Admin",
      activePage: category === "food" ? "food" : category === "clothes" ? "clothes" : category === "money" ? "money" : "donations",
      donations: data.donations,
      pagination: data.pagination,
      filters: { category, donorType, status, search, sort }
    });
  } catch (err) {
    console.error("[Admin Donations Error]:", err);
    res.status(500).send("Error loading donations: " + err.message);
  }
});

// -------------------------------------------------------------
// Donation Details
// -------------------------------------------------------------
router.get("/donations/:modelType/:id", isAdmin, async (req, res) => {
  try {
    const { modelType, id } = req.params;
    const donation = await getDonationById(modelType, id);

    if (!donation) {
      return res.status(404).render("admin/error", {
        title: "Not Found",
        message: "The requested donation record was not found."
      });
    }

    res.render("admin/donation_details", {
      title: `Donation Details #${id.substring(id.length - 6)} - StreetBites Admin`,
      activePage: "donations",
      donation
    });
  } catch (err) {
    console.error("[Admin Donation Details Error]:", err);
    res.status(500).send("Error loading donation details: " + err.message);
  }
});

// -------------------------------------------------------------
// Update Donation Status
// -------------------------------------------------------------
router.post("/donations/:modelType/:id/status", isAdmin, async (req, res) => {
  try {
    const { modelType, id } = req.params;
    const { status } = req.body;

    await updateDonationStatus(modelType, id, status);

    const redirectUrl = req.headers.referer || `/admin/donations/${modelType}/${id}`;
    const separator = redirectUrl.includes("?") ? "&" : "?";
    return res.redirect(`${redirectUrl}${separator}success=` + encodeURIComponent(`Status updated to '${status}'.`));
  } catch (err) {
    console.error("[Admin Update Status Error]:", err);
    const redirectUrl = req.headers.referer || `/admin/donations/${req.params.modelType}/${req.params.id}`;
    const separator = redirectUrl.includes("?") ? "&" : "?";
    return res.redirect(`${redirectUrl}${separator}error=` + encodeURIComponent(err.message));
  }
});

// -------------------------------------------------------------
// Users Management
// -------------------------------------------------------------
router.get("/users", isAdmin, async (req, res) => {
  try {
    const { search = "", page = 1 } = req.query;
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const limit = 10;

    const query = {};
    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { fullName: new RegExp(q, "i") },
        { username: new RegExp(q, "i") },
        { email: new RegExp(q, "i") },
        { mobile: new RegExp(q, "i") }
      ];
    }

    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit) || 1;

    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .lean();

    res.render("admin/users", {
      title: "Registered Users - StreetBites Admin",
      activePage: "users",
      users,
      pagination: {
        currentPage,
        totalPages,
        totalCount: totalUsers,
        limit,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1
      },
      search
    });
  } catch (err) {
    console.error("[Admin Users Error]:", err);
    res.status(500).send("Error loading users: " + err.message);
  }
});

// -------------------------------------------------------------
// User Profile & Associated Donations
// -------------------------------------------------------------
router.get("/users/:id", isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password").lean();
    if (!user) {
      return res.status(404).render("admin/error", {
        title: "User Not Found",
        message: "The requested user account does not exist."
      });
    }

    const donations = await getUserDonations(user._id, user.email);

    res.render("admin/user_details", {
      title: `User Profile: ${user.fullName} - StreetBites Admin`,
      activePage: "users",
      user,
      donations
    });
  } catch (err) {
    console.error("[Admin User Details Error]:", err);
    res.status(500).send("Error loading user profile: " + err.message);
  }
});

module.exports = router;

