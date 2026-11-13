function isAdmin(req, res, next) {
  if (req.session && req.session.user) {
    if (req.session.user.role === "admin") {
      return next();
    }
    return res.status(403).render("admin/forbidden", {
      title: "Access Denied",
      message: "You do not have administrator permissions to access this portal."
    });
  }

  req.session.returnTo = req.originalUrl;
  return res.redirect("/admin/login?error=" + encodeURIComponent("Administrator login required."));
}

module.exports = {
  isAdmin
};

