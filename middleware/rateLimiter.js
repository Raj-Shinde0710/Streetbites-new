const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each IP to 30 authentication requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const errorMsg = "Too many login/registration attempts. Please wait 15 minutes before trying again.";
    if (req.originalUrl.includes("/admin")) {
      return res.redirect("/admin/login?error=" + encodeURIComponent(errorMsg));
    }
    return res.redirect("/login?error=" + encodeURIComponent(errorMsg));
  }
});

module.exports = {
  authLimiter
};

