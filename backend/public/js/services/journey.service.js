
import { apiRequest } from "./api.service.js";

export function startJourney({
  destinationName,
  destinationLat,
  destinationLng,
  latitude,
  longitude,
}) {
  return apiRequest("/journeys", {
    method: "POST",
    body: JSON.stringify({
      destinationName,
      destinationLat,
      destinationLng,
      startLocation: {
        latitude,
        longitude,
      },
    }),
  });
}

export function getActiveJourney() {
  return apiRequest("/journeys/active");
}

export function updateJourneyLocation(journeyId, latitude, longitude) {
  return apiRequest(
    `/journeys/${encodeURIComponent(journeyId)}/location`,
    {
      method: "PATCH",
      body: JSON.stringify({ latitude, longitude }),
    }
  );
}

export function completeJourney(journeyId) {
  return apiRequest(
    `/journeys/${encodeURIComponent(journeyId)}/complete`,
    { method: "PATCH" }
  );
}

export function cancelJourney(journeyId) {
  return apiRequest(
    `/journeys/${encodeURIComponent(journeyId)}/cancel`,
    { method: "PATCH" }
  );
}

export function getFriendsActiveJourneys() {
  return apiRequest("/journeys/friends/active");
}
