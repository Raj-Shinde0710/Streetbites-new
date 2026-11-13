const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { isAuthenticated, isGuest, getSafeRedirectUrl } = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimiter");
const { getUserDonations } = require("../utils/donationService");

// -------------------------------------------------------------
// User Registration
// -------------------------------------------------------------
router.get("/register", isGuest, (req, res) => {
  const redirectUrl = getSafeRedirectUrl(req.query.redirect || req.session.returnTo || "");
  res.render("register", {
    title: "Register - StreetBites",
    formData: {},
    redirectUrl
  });
});

router.post("/register", isGuest, authLimiter, async (req, res) => {
  const { fullName, username, email, mobile, password, confirmPassword, redirect } = req.body;
  const redirectUrl = getSafeRedirectUrl(redirect || req.query.redirect || "");
  const formData = { fullName, username, email, mobile };

  try {
    // 1. Validate required fields
    if (!fullName || !username || !email || !password || !confirmPassword) {
      return res.render("register", {
        title: "Register - StreetBites",
        error: "All required fields must be filled out.",
        formData,
        redirectUrl
      });
    }

    // 2. Validate username format
    const cleanUsername = username.toLowerCase().trim();
    if (cleanUsername.length < 3) {
      return res.render("register", {
        title: "Register - StreetBites",
        error: "Username must be at least 3 characters long.",
        formData,
        redirectUrl
      });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      return res.render("register", {
        title: "Register - StreetBites",
        error: "Username can only contain letters, numbers, and underscores.",
        formData,
        redirectUrl
      });
    }

    // 3. Validate email format
    const cleanEmail = email.toLowerCase().trim();
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.render("register", {
        title: "Register - StreetBites",
        error: "Please enter a valid email address.",
        formData,
        redirectUrl
      });
    }

    // 4. Validate password length & confirmation
    if (password.length < 6) {
      return res.render("register", {
        title: "Register - StreetBites",
        error: "Password must be at least 6 characters long.",
        formData,
        redirectUrl
      });
    }
    if (password !== confirmPassword) {
      return res.render("register", {
        title: "Register - StreetBites",
        error: "Passwords do not match.",
        formData,
        redirectUrl
      });
    }

    // 5. Check if username or email already exists
    const existingUser = await User.findOne({
      $or: [{ username: cleanUsername }, { email: cleanEmail }]
    });

    if (existingUser) {
      if (existingUser.username === cleanUsername) {
        return res.render("register", {
          title: "Register - StreetBites",
          error: "Username is already taken. Please choose another one.",
          formData,
          redirectUrl
        });
      }
      if (existingUser.email === cleanEmail) {
        return res.render("register", {
          title: "Register - StreetBites",
          error: "An account with this email address already exists.",
          formData,
          redirectUrl
        });
      }
    }

    // 6. Create and save new user
    const newUser = new User({
      fullName: fullName.trim(),
      username: cleanUsername,
      email: cleanEmail,
      mobile: (mobile || "").trim(),
      password, // hashed automatically by User model pre-save hook
      role: "user"
    });

    await newUser.save();

    const redirectQuery = redirectUrl && redirectUrl !== "/" ? `&redirect=${encodeURIComponent(redirectUrl)}` : "";
    return res.redirect(
      `/login?success=${encodeURIComponent("Account created successfully! Please sign in with your credentials.")}${redirectQuery}`
    );
  } catch (err) {
    console.error("[Registration Error]:", err);
    return res.render("register", {
      title: "Register - StreetBites",
      error: "An unexpected error occurred during registration. Please try again.",
      formData,
      redirectUrl
    });
  }
});

// -------------------------------------------------------------
// User Login
// -------------------------------------------------------------
router.get("/login", isGuest, (req, res) => {
  const redirectUrl = getSafeRedirectUrl(req.query.redirect || req.session.returnTo || "");
  res.render("login", {
    title: "Login - StreetBites",
    usernameVal: "",
    redirectUrl
  });
});

router.post("/login", isGuest, authLimiter, async (req, res) => {
  const { username, password, redirect } = req.body;
  const usernameVal = (username || "").trim();
  const rawRedirect = redirect || req.query.redirect || req.session.returnTo || "/";
  const destination = getSafeRedirectUrl(rawRedirect);

  try {
    if (!usernameVal || !password) {
      return res.render("login", {
        title: "Login - StreetBites",
        error: "Please enter both username/email and password.",
        usernameVal,
        redirectUrl: destination
      });
    }

    const cleanInput = usernameVal.toLowerCase();

    // Allow user to log in with either username or email
    const user = await User.findOne({
      $or: [{ username: cleanInput }, { email: cleanInput }]
    });

    if (!user) {
      return res.render("login", {
        title: "Login - StreetBites",
        error: "Invalid username or password.",
        usernameVal,
        redirectUrl: destination
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.render("login", {
        title: "Login - StreetBites",
        error: "Invalid username or password.",
        usernameVal,
        redirectUrl: destination
      });
    }

    if (user.status === "suspended") {
      return res.render("login", {
        title: "Login - StreetBites",
        error: "Your account has been suspended. Please contact support.",
        usernameVal,
        redirectUrl: destination
      });
    }

    // Regenerate session to prevent session fixation attacks
    req.session.regenerate((err) => {
      if (err) {
        console.error("[Session Regenerate Error]:", err);
        return res.redirect("/login?error=" + encodeURIComponent("Login failed. Please try again."));
      }

      req.session.userId = user._id.toString();
      req.session.user = {
        id: user._id.toString(),
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        mobile: user.mobile,
        role: user.role
      };

      delete req.session.returnTo;

      if (user.role === "admin") {
        return res.redirect("/admin/dashboard");
      }

      return res.redirect(destination);
    });
  } catch (err) {
    console.error("[Login Error]:", err);
    return res.render("login", {
      title: "Login - StreetBites",
      error: "An unexpected error occurred during login. Please try again.",
      usernameVal,
      redirectUrl: destination
    });
  }
});

// -------------------------------------------------------------
// User Logout
// -------------------------------------------------------------
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("[Logout Error]:", err);
    res.clearCookie("connect.sid");
    res.redirect("/login?success=" + encodeURIComponent("You have been logged out successfully."));
  });
});

// -------------------------------------------------------------
// My Account (Protected)
// -------------------------------------------------------------
router.get("/my-account", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id).lean();
    if (!user) {
      req.session.destroy(() => {});
      return res.redirect("/login?error=" + encodeURIComponent("User not found. Please log in again."));
    }

    const donations = await getUserDonations(user._id, user.email);

    res.render("my_account", {
      title: "My Account - StreetBites",
      user,
      donations
    });
  } catch (err) {
    console.error("[My Account Error]:", err);
    res.status(500).send("Error loading account profile.");
  }
});

module.exports = router;
