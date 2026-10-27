
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";

import {
  sendRequest,
  listRequests,
  acceptRequest,
  rejectRequest,
  listFriends,
  deleteFriend,
} from "./friends.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listFriends);

router.post("/requests", sendRequest);
router.get("/requests", listRequests);
router.patch("/requests/:id/accept", acceptRequest);
router.patch("/requests/:id/reject", rejectRequest);

router.delete("/:id", deleteFriend);

export default router;
