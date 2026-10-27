
import { endJourney, getActiveJourney, getFriendsActiveJourneys, startJourney, updateJourneyLocation } from "./journey.service.js";
import { startJourneySchema, updateJourneyLocationSchema } from "./journey.validation.js";

const handleError = (res, error) => {
  if (error.name === "ZodError") {
    return res.status(400).json({
      message: "Validation failed.",
      errors: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const statusCode = error.statusCode || 500;

  if (statusCode === 500) {
    console.error("Journeys error:", error);
  }

  return res.status(statusCode).json({
    message:
      statusCode === 500
        ? "An unexpected error occurred."
        : error.message,
  });
};

export const startJourneyController = async (req, res) => {
  try {
    const input = startJourneySchema.parse(req.body);

    const journey = await startJourney(req.user.id, input);

    return res.status(201).json({
      message: "Journey started successfully.",
      journey,
    });
  } catch (error) {
    return handleError(res, error);
  }
};


export const getActiveJourneyController = async (req, res) => {
  try {
    const journey = await getActiveJourney(req.user.id);

    return res.json({ journey });
  } catch (error) {
    return handleError(res, error);
  }
};

export const updateJourneyLocationController = async (req, res) => {
  try {
    const location = updateJourneyLocationSchema.parse(req.body);

    const journey = await updateJourneyLocation(
      req.user.id,
      req.params.id,
      location
    );

    return res.json({
      message: "Journey location updated successfully.",
      journey,
    });
  } catch (error) {
    return handleError(res, error);
  }
};


export const completeJourneyController = async (req, res) => {
  try {
    const journey = await endJourney(
      req.user.id,
      req.params.id,
      "complete"
    );

    return res.json({
      message: "Journey completed successfully.",
      journey,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const cancelJourneyController = async (req, res) => {
  try {
    const journey = await endJourney(
      req.user.id,
      req.params.id,
      "cancel"
    );

    return res.json({
      message: "Journey cancelled successfully.",
      journey,
    });
  } catch (error) {
    return handleError(res, error);
  }
};


export const getFriendsActiveJourneysController = async (req, res) => {
  try {
    const journeys = await getFriendsActiveJourneys(req.user.id);

    return res.json({ journeys });
  } catch (error) {
    return handleError(res, error);
  }
};
