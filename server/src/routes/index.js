import { Router } from "express";
import authRoutes from "./auth.js";
import planRoutes from "./plans.js";
import courtRoutes from "./courts.js";
import availabilityRoutes from "./availability.js";
import shopPublicRoutes from "./shop.public.js";
import publicRoutes from "./public.js";
import memberRoutes from "./members.js";
import bookingRoutes from "./bookings.js";
import shopRoutes from "./shop.js";
import barRoutes from "./bar.js";
import enquiryRoutes from "./enquiries.js";
import notificationRoutes from "./notifications.js";
import financeRoutes from "./finance.js";
import deskRoutes from "./desk.js";
import hrRoutes from "./hr.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// public (the club website uses these)
router.use("/auth", authRoutes);
router.use("/plans", planRoutes);
router.use("/courts", courtRoutes);
router.use("/availability", availabilityRoutes);
router.use("/shop", shopPublicRoutes);        // catalog + online orders
router.use("/public", publicRoutes);          // club info, trial booking, contact form

// staff
router.use("/members", requireAuth, memberRoutes);
router.use("/bookings", requireAuth, bookingRoutes);
router.use("/shop", requireAuth, shopRoutes); // anything the public router didn't handle
router.use("/bar", requireAuth, barRoutes);
router.use("/enquiries", requireAuth, enquiryRoutes);
router.use("/notifications", requireAuth, notificationRoutes);
router.use("/desk", requireAuth, deskRoutes);  // record payments, print receipts (any staff)
router.use("/hr", requireAuth, hrRoutes);      // employees (managers) and leave (everyone)

// owner and manager only
router.use("/finance", requireAuth, financeRoutes);

export default router;
