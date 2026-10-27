
import jwt from "jsonwebtoken";

export function requirePageAuth(req, res, next) {
  const token = req.cookies?.authToken;
  const secret = process.env.JWT_SECRET;

  if (!token || !secret || secret.length < 32) {
    return res.redirect("/login");
  }

  try {
    jwt.verify(token, secret);
    return next();
  } catch {
    res.clearCookie("authToken", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });

    return res.redirect("/login");
  }
}
