
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { cancelJourneyController, completeJourneyController, getActiveJourneyController, getFriendsActiveJourneysController, startJourneyController, updateJourneyLocationController } from "./journey.controller.js";


const router = Router();

router.use(requireAuth);

router.post("/", startJourneyController);
router.get("/active", getActiveJourneyController);
router.patch("/:id/location", updateJourneyLocationController);
router.patch("/:id/complete", completeJourneyController);
router.patch("/:id/cancel", cancelJourneyController);
router.get("/friends/active", getFriendsActiveJourneysController);

export default router;
