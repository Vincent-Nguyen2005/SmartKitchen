import type { RequestHandler } from "express";

export const requireRecipeAdmin: RequestHandler = (request, response, next) => {
  const role = request.header("x-user-role");
  if (!role) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }
  if (role !== "ADMIN") {
    response.status(403).json({ error: "Administrator access required" });
    return;
  }
  next();
};
