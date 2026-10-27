import { LiveRouteService } from "../services/live-route.service.js";
import {
    startJourney,
    getActiveJourney,
    updateJourneyLocation,
    completeJourney,
    cancelJourney,
    getFriendsActiveJourneys,
} from "../services/journey.service.js";

const socket = io();

// --------------------------------------------------
// DOM ELEMENTS
// --------------------------------------------------

const connectionStatus = document.getElementById("connection-status");
const locationMessage = document.getElementById("location-message");
const myLocationButton = document.getElementById("my-location");
const shareLocationButton = document.getElementById("share-location");
const planJourneyButton = document.getElementById("plan-journey-button");
const journeyPlanner = document.getElementById("journey-planner");
const logoutButton = document.getElementById("logout-button");

const destinationForm = document.getElementById("destination-form");
const destinationInput = document.getElementById("destination-input");
const searchButton = document.getElementById("search-button");
const selectOnMapButton = document.getElementById("select-on-map");
const searchResults = document.getElementById("search-results");
const routeSummary = document.getElementById("route-summary");
const routeDistance = document.getElementById("route-distance");
const routeDuration = document.getElementById("route-duration");
const clearRouteButton = document.getElementById("clear-route");

const startJourneyButton = document.getElementById("start-journey");
const completeJourneyButton = document.getElementById("complete-journey");
const cancelJourneyButton = document.getElementById("cancel-journey");
const journeyStatus = document.getElementById("journey-status");
const journeyBadge = document.getElementById("journey-badge");

const refreshFriendsJourneysButton = document.getElementById(
    "refresh-friends-journeys"
);
const friendsJourneysMessage = document.getElementById(
    "friends-journeys-message"
);
const friendsJourneysList = document.getElementById(
    "friends-journeys-list"
);

// --------------------------------------------------
// MAP
// --------------------------------------------------

const map = L.map("map").setView([20.5937, 78.9629], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
}).addTo(map);

// The planner lives in the sidebar, outside the Leaflet map container.
// No Leaflet event suppression is needed here.

// --------------------------------------------------
// STATE
// --------------------------------------------------

const markers = {};

let myPosition = null;
let watchId = null;
let isSharing = false;
let hasCenteredOnMe = false;

let destination = null;
let destinationMarker = null;
let routeLayer = null;
let selectedMode = "car";

let liveRouteService = null;

let routeRequestInProgress = false;
let routeRequestController = null;
let activeRouteRequestId = 0;

let searchTimer = null;
let searchController = null;
let latestSearchId = 0;

let isMapSelectionMode = false;
let mapSelectionId = 0;
let mapSelectionController = null;

// Journey state
let activeJourney = null;
let journeyRequestInProgress = false;
let pendingJourneyStart = false;
let lastJourneyLocationUpdateAt = 0;
let journeyLocationUpdateInProgress = false;

const JOURNEY_LOCATION_UPDATE_INTERVAL = 10000;

// --------------------------------------------------
// RESPONSE HELPERS
// --------------------------------------------------

function extractJourney(response) {
    if (response?.journey !== undefined) {
        return response.journey;
    }

    if (response?.data?.journey !== undefined) {
        return response.data.journey;
    }

    if (response?.id && response?.status) {
        return response;
    }

    return null;
}

function extractFriendsJourneys(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.journeys)) return response.journeys;
    if (Array.isArray(response?.friends)) return response.friends;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.data?.journeys)) {
        return response.data.journeys;
    }

    return [];
}

// --------------------------------------------------
// MAP MESSAGES
// --------------------------------------------------

function showLocationMessage(message) {
    locationMessage.textContent = message;
    locationMessage.classList.remove("hidden");
}

function hideLocationMessage() {
    locationMessage.classList.add("hidden");
}

// --------------------------------------------------
// JOURNEY UI
// --------------------------------------------------

function updateJourneyControls() {
    const hasDestination = Boolean(destination);
    const hasActiveJourney = Boolean(activeJourney);
    const isBusy = journeyRequestInProgress;

    startJourneyButton.disabled =
        !hasDestination || hasActiveJourney || isBusy;

    completeJourneyButton.disabled = !hasActiveJourney || isBusy;
    cancelJourneyButton.disabled = !hasActiveJourney || isBusy;

    if (hasActiveJourney) {
        journeyStatus.textContent =
            `Journey to ${activeJourney.destinationName} is active.`;

        journeyBadge.textContent = "Active";
        journeyBadge.classList.add("active");
    } else {
        journeyStatus.textContent = hasDestination
            ? "Destination selected. Ready to start your journey."
            : "Select a destination to start a journey.";

        journeyBadge.textContent = "Inactive";
        journeyBadge.classList.remove("active");
    }

    startJourneyButton.textContent = isBusy
        ? "Please wait..."
        : "Start Journey";
}

async function loadActiveJourney() {
    try {
        const response = await getActiveJourney();
        activeJourney = extractJourney(response);

        if (activeJourney?.status !== "ACTIVE") {
            activeJourney = null;
        }
    } catch (error) {
        console.error("Unable to load active journey:", error);
    }

    updateJourneyControls();
}
async function refreshFriendsJourneys() {
    // Friends activity is now displayed on the Friends page.
    // Keep this function safe for existing journey callbacks.
    if (
        !refreshFriendsJourneysButton ||
        !friendsJourneysMessage ||
        !friendsJourneysList
    ) {
        return;
    }

    refreshFriendsJourneysButton.disabled = true;
    friendsJourneysMessage.textContent = "Loading friends' journeys...";
    friendsJourneysList.replaceChildren();

    try {
        const response = await getFriendsActiveJourneys();
        const journeys = extractFriendsJourneys(response);

        if (journeys.length === 0) {
            friendsJourneysMessage.textContent =
                "None of your friends is sharing an active journey.";
            return;
        }

        friendsJourneysMessage.textContent =
            `${journeys.length} active friend journey(s).`;

        journeys.forEach((journey) => {
            const item = document.createElement("li");
            const name = document.createElement("strong");
            const destinationText = document.createElement("span");

            name.textContent =
                journey.user?.name ||
                journey.userName ||
                journey.name ||
                "Friend";

            destinationText.textContent =
                ` → ${journey.destinationName || "Destination not available"}`;

            item.append(name, destinationText);

            const latitude = Number(journey.currentLat);
            const longitude = Number(journey.currentLng);

            if (
                Number.isFinite(latitude) &&
                Number.isFinite(longitude) &&
                latitude >= -90 &&
                latitude <= 90 &&
                longitude >= -180 &&
                longitude <= 180
            ) {
                const viewButton = document.createElement("button");
                viewButton.type = "button";
                viewButton.textContent = "View on map";

                viewButton.addEventListener("click", () => {
                    map.setView([latitude, longitude], 15);
                });

                item.appendChild(viewButton);
            }

            friendsJourneysList.appendChild(item);
        });
    } catch (error) {
        console.error("Unable to load friends' journeys:", error);
        friendsJourneysMessage.textContent =
            error.message || "Unable to load friends' journeys.";
    } finally {
        refreshFriendsJourneysButton.disabled = false;
    }
}

async function startSelectedJourney() {
    if (journeyRequestInProgress || activeJourney) return;

    if (!destination) {
        updateJourneyControls();
        showLocationMessage("Select a destination before starting a journey.");
        return;
    }

    if (!myPosition) {
        pendingJourneyStart = true;
        showLocationMessage(
            "Getting your current location before starting the journey..."
        );
        startSharing();
        return;
    }

    journeyRequestInProgress = true;
    pendingJourneyStart = false;
    updateJourneyControls();

    try {
        const [latitude, longitude] = myPosition;

        const response = await startJourney({
            destinationName: destination.name || destination.displayName,
            destinationLat: destination.latitude,
            destinationLng: destination.longitude,
            latitude,
            longitude,
        });

        activeJourney = extractJourney(response);

        if (!activeJourney?.id) {
            activeJourney = null;
            throw new Error(
                "The server did not return a valid journey. Please try again."
            );
        }

        updateJourneyControls();

        showLocationMessage("Your journey has started.");

        lastJourneyLocationUpdateAt = Date.now();

        await refreshFriendsJourneys();
    } catch (error) {
        console.error("Unable to start journey:", error);

        showLocationMessage(
            error.message || "Unable to start your journey."
        );
    } finally {
        journeyRequestInProgress = false;
        updateJourneyControls();
    }
}

async function endActiveJourney(action) {
    if (!activeJourney || journeyRequestInProgress) return;

    journeyRequestInProgress = true;
    updateJourneyControls();

    const journeyId = activeJourney.id;

    try {
        if (action === "complete") {
            await completeJourney(journeyId);
        } else {
            await cancelJourney(journeyId);
        }

        activeJourney = null;
        pendingJourneyStart = false;
        lastJourneyLocationUpdateAt = 0;

        updateJourneyControls();

        showLocationMessage(
            action === "complete"
                ? "Journey completed successfully."
                : "Journey cancelled."
        );

        await refreshFriendsJourneys();
    } catch (error) {
        console.error(`Unable to ${action} journey:`, error);

        showLocationMessage(
            error.message || `Unable to ${action} your journey.`
        );
    } finally {
        journeyRequestInProgress = false;
        updateJourneyControls();
    }
}

startJourneyButton.addEventListener("click", startSelectedJourney);

completeJourneyButton.addEventListener("click", () => {
    endActiveJourney("complete");
});

cancelJourneyButton.addEventListener("click", () => {
    endActiveJourney("cancel");
});

refreshFriendsJourneysButton?.addEventListener(
    "click",
    refreshFriendsJourneys
);
// --------------------------------------------------
// UPDATE ACTIVE JOURNEY LOCATION
// --------------------------------------------------

async function syncActiveJourneyLocation(latitude, longitude) {
    if (
        !activeJourney ||
        journeyLocationUpdateInProgress ||
        Date.now() - lastJourneyLocationUpdateAt <
            JOURNEY_LOCATION_UPDATE_INTERVAL
    ) {
        return;
    }

    journeyLocationUpdateInProgress = true;
    lastJourneyLocationUpdateAt = Date.now();

    try {
        await updateJourneyLocation(
            activeJourney.id,
            latitude,
            longitude
        );
    } catch (error) {
        console.error("Journey location update failed:", error);

        // Permit an earlier retry if the request failed.
        lastJourneyLocationUpdateAt = 0;
    } finally {
        journeyLocationUpdateInProgress = false;
    }
}
// --------------------------------------------------
// JOURNEY PLANNER VISIBILITY
// --------------------------------------------------

planJourneyButton?.addEventListener("click", () => {
    if (!journeyPlanner) return;

    const isHidden = journeyPlanner.classList.toggle("hidden");

    planJourneyButton.setAttribute(
        "aria-expanded",
        String(!isHidden)
    );

    planJourneyButton.textContent = isHidden
        ? "Plan a Journey"
        : "Hide Planner";

    // Recalculate Leaflet dimensions after the layout changes.
    requestAnimationFrame(() => {
        map.invalidateSize();
    });
});
// --------------------------------------------------
// DESTINATION SELECTION HELPERS
// --------------------------------------------------

function clearDisplayedRoute() {
    cancelActiveRouteRequest();

    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }

    routeSummary.classList.add("hidden");
    clearRouteButton.classList.add("hidden");
}

function invalidateDestinationSelection() {
    destination = null;
    updateJourneyControls();
    clearDisplayedRoute();

    if (destinationMarker) {
        map.removeLayer(destinationMarker);
        destinationMarker = null;
    }
}

// --------------------------------------------------
// MAP DESTINATION SELECTION MODE
// --------------------------------------------------

function setMapSelectionMode(enabled) {
    isMapSelectionMode = enabled;

    selectOnMapButton.classList.toggle("active", enabled);

    selectOnMapButton.setAttribute(
        "aria-pressed",
        String(enabled)
    );

    selectOnMapButton.innerHTML = enabled
        ? '<span class="map-select-icon">×</span><span class="map-select-label">Cancel Selection</span>'
        : '<span class="map-select-icon">＋</span><span class="map-select-label">Select on Map</span>';

    map.getContainer().classList.toggle(
        "selecting-destination",
        enabled
    );

    if (enabled) {
        showLocationMessage(
            "Selection mode is ON. Click your destination on the map."
        );
    } else {
        hideLocationMessage();
    }
}

selectOnMapButton.addEventListener("click", () => {
    if (isMapSelectionMode) {
        setMapSelectionMode(false);
        showLocationMessage("Map selection cancelled.");
        return;
    }

    mapSelectionId += 1;
    mapSelectionController?.abort();
    mapSelectionController = null;

    setMapSelectionMode(true);
});

// --------------------------------------------------
// LIVE ROUTE SERVICE CONFIGURATION
// --------------------------------------------------

async function initializeLiveRouteService() {
    try {
        const response = await fetch("/api/config");

        if (!response.ok) {
            throw new Error("Unable to load live-route configuration.");
        }

        const config = await response.json();

        const intervalMs = Number(config.liveRouteUpdateIntervalMs);
        const minMovementMeters = Number(
            config.liveRouteMinMovementMeters
        );

        if (
            !Number.isFinite(intervalMs) ||
            intervalMs < 1 ||
            !Number.isFinite(minMovementMeters) ||
            minMovementMeters < 0
        ) {
            throw new Error("Invalid live-route configuration.");
        }

        liveRouteService?.destroy();

        liveRouteService = new LiveRouteService({
            intervalMs,
            minMovementMeters,

            onUpdate: async () => {
                if (!isSharing || !myPosition || !destination) {
                    return false;
                }

                return await getRoute({ fitMap: false });
            },
        });

        if (isSharing && myPosition && destination) {
            liveRouteService.updatePosition(myPosition);
        }
    } catch (error) {
        console.error("Live route initialization failed:", error);
    }
}

initializeLiveRouteService();

// --------------------------------------------------
// LOCATION SHARING
// --------------------------------------------------

function updateShareButton() {
    shareLocationButton.textContent = isSharing
        ? "Stop Sharing"
        : "Share Location";

    shareLocationButton.classList.toggle("sharing", isSharing);
}

function removeMyMarker() {
    if (markers[socket.id]) {
        map.removeLayer(markers[socket.id]);
        delete markers[socket.id];
    }
}

socket.on("connect", () => {
    connectionStatus.textContent = "Connected";
    connectionStatus.classList.add("connected");
});

socket.on("disconnect", () => {
    connectionStatus.textContent = "Disconnected";
    connectionStatus.classList.remove("connected");

    if (isSharing) {
        stopSharing(
            "Disconnected from server. Tap Share Location to try again."
        );
    }
});

function startSharing() {
    if (isSharing) return;

    if (!navigator.geolocation) {
        pendingJourneyStart = false;

        showLocationMessage(
            "Geolocation is not supported by this browser."
        );
        return;
    }

    if (!socket.connected) {
        showLocationMessage(
            "Connecting to the server. Please try again shortly."
        );
        return;
    }

    isSharing = true;
    updateShareButton();
    showLocationMessage("Requesting location permission...");

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            if (!isSharing) return;

            const { latitude, longitude } = position.coords;

            myPosition = [latitude, longitude];

            liveRouteService?.updatePosition(myPosition);

            if (destination && !routeLayer && !routeRequestInProgress) {
                getRoute();
            }

            // If Start Journey was clicked before location was available,
            // start the journey now that we have coordinates.
            if (pendingJourneyStart && destination && !activeJourney) {
                startSelectedJourney();
            }

            syncActiveJourneyLocation(latitude, longitude);

            hideLocationMessage();

            socket.emit("send-location", {
                latitude,
                longitude,
            });

            if (!hasCenteredOnMe) {
                map.setView(myPosition, 16);
                hasCenteredOnMe = true;
            }

            myLocationButton.disabled = false;
        },
        (error) => {
            const messages = {
                1: "Location permission denied. Check your browser settings.",
                2: "Your location is unavailable. Check device location services.",
                3: "Location request timed out. Please try again.",
            };

            pendingJourneyStart = false;

            stopSharing(
                messages[error.code] || "Unable to get your location."
            );
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 5000,
        }
    );
}

function cancelActiveRouteRequest() {
    activeRouteRequestId += 1;

    if (routeRequestController) {
        routeRequestController.abort();
        routeRequestController = null;
    }

    routeRequestInProgress = false;
}

function stopSharing(message = "Location sharing stopped.") {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    const wasSharing = isSharing;
    isSharing = false;

    liveRouteService?.reset();
    cancelActiveRouteRequest();

    updateShareButton();
    removeMyMarker();

    if (wasSharing && socket.connected) {
        socket.emit("stop-sharing");
    }

    showLocationMessage(message);
}

shareLocationButton.addEventListener("click", () => {
    if (isSharing) {
        stopSharing();
    } else {
        startSharing();
    }
});

myLocationButton.addEventListener("click", () => {
    if (myPosition) {
        map.setView(myPosition, 16);
    } else {
        showLocationMessage(
            "Tap Share Location to get your current location."
        );
    }
});

// --------------------------------------------------
// OTHER CONNECTED USERS
// --------------------------------------------------

socket.on("receive-location", (data) => {
    const { id, latitude, longitude } = data;

    if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return;
    }

    if (id === socket.id && !isSharing) return;

    const position = [latitude, longitude];

    if (markers[id]) {
        markers[id].setLatLng(position);
    } else {
        markers[id] = L.marker(position)
            .addTo(map)
            .bindPopup(id === socket.id ? "You" : "Connected user");
    }
});

socket.on("user-disconnected", (id) => {
    if (markers[id]) {
        map.removeLayer(markers[id]);
        delete markers[id];
    }
});

// --------------------------------------------------
// DESTINATION AUTOCOMPLETE
// --------------------------------------------------

async function searchPlaces() {
    const query = destinationInput.value.trim();
    const searchId = ++latestSearchId;

    searchController?.abort();
    searchController = null;

    if (query.length < 3) {
        searchResults.replaceChildren();
        searchResults.classList.add("hidden");
        searchButton.disabled = false;
        searchButton.textContent = "Search";
        return;
    }

    const controller = new AbortController();
    searchController = controller;

    searchButton.disabled = true;
    searchButton.textContent = "Searching...";

    searchResults.replaceChildren();

    const loading = document.createElement("div");
    loading.className = "search-status";
    loading.textContent = "Finding places...";

    searchResults.appendChild(loading);
    searchResults.classList.remove("hidden");

    try {
        const response = await fetch(
            `/api/geocode?q=${encodeURIComponent(query)}`,
            { signal: controller.signal }
        );

        const results = await response.json();

        if (!response.ok) {
            throw new Error(
                results.message || "Place search failed."
            );
        }

        if (searchId !== latestSearchId) return;

        searchResults.replaceChildren();

        if (!Array.isArray(results) || results.length === 0) {
            const empty = document.createElement("div");
            empty.className = "search-status";
            empty.textContent = "No places found. Try another search.";

            searchResults.appendChild(empty);
            return;
        }

        results.forEach((place) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "place-result";

            const title = document.createElement("strong");
            title.textContent = place.name;

            const description = document.createElement("span");
            description.textContent = place.displayName;

            button.append(title, description);

            button.addEventListener("click", () => {
                setMapSelectionMode(false);

                mapSelectionId += 1;
                mapSelectionController?.abort();
                mapSelectionController = null;

                destination = {
                    name: place.name,
                    displayName: place.displayName,
                    latitude: place.latitude,
                    longitude: place.longitude,
                };

                destinationInput.value = place.displayName;

                searchResults.replaceChildren();
                searchResults.classList.add("hidden");

                if (destinationMarker) {
                    map.removeLayer(destinationMarker);
                }

                destinationMarker = L.marker([
                    destination.latitude,
                    destination.longitude,
                ])
                    .addTo(map)
                    .bindPopup(destination.name)
                    .openPopup();

                cancelActiveRouteRequest();
                updateJourneyControls();

                if (myPosition) {
                    getRoute();
                    hideLocationMessage();
                } else {
                    map.setView(
                        [destination.latitude, destination.longitude],
                        14
                    );

                    showLocationMessage(
                        "Destination selected. You can start your journey; your current location will be requested if needed."
                    );
                }
            });

            searchResults.appendChild(button);
        });
    } catch (error) {
        if (error.name === "AbortError") return;
        if (searchId !== latestSearchId) return;

        searchResults.replaceChildren();

        const errorMessage = document.createElement("div");
        errorMessage.className = "search-status";
        errorMessage.textContent = error.message;

        searchResults.appendChild(errorMessage);
    } finally {
        if (searchId === latestSearchId) {
            searchButton.disabled = false;
            searchButton.textContent = "Search";
            searchController = null;
        }
    }
}

destinationInput.addEventListener("input", () => {
    // Typing a new address invalidates the previous selection.
    if (
        destination &&
        destinationInput.value.trim() !== destination.displayName
    ) {
        invalidateDestinationSelection();
    }

    clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
        searchPlaces();
    }, 500);
});

destinationForm.addEventListener("submit", (event) => {
    event.preventDefault();

    clearTimeout(searchTimer);
    searchPlaces();
});

// --------------------------------------------------
// TRAVEL MODE
// --------------------------------------------------

document.querySelectorAll(".mode-button").forEach((button) => {
    button.addEventListener("click", () => {
        const mode = button.dataset.mode;

        if (!["car", "bike", "foot"].includes(mode)) {
            return;
        }

        selectedMode = mode;

        document.querySelectorAll(".mode-button").forEach((item) => {
            item.classList.toggle("active", item === button);
        });

        if (destination && myPosition) {
            getRoute();
        }
    });
});

// --------------------------------------------------
// SELECT DESTINATION BY CLICKING THE MAP
// --------------------------------------------------

map.on("click", async (event) => {
    if (event.originalEvent?.target?.closest?.(".search-panel")) {
        return;
    }

    if (!isMapSelectionMode) return;

    const latitude = event.latlng.lat;
    const longitude = event.latlng.lng;
    const clickedPosition = [latitude, longitude];

    setMapSelectionMode(false);

    const selectionId = ++mapSelectionId;

    mapSelectionController?.abort();

    const controller = new AbortController();
    mapSelectionController = controller;

    clearTimeout(searchTimer);
    searchController?.abort();
    searchController = null;
    latestSearchId += 1;

    searchButton.disabled = false;
    searchButton.textContent = "Search";

    searchResults.replaceChildren();
    searchResults.classList.add("hidden");

    cancelActiveRouteRequest();

    destination = {
        name: "Selected destination",
        displayName: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        latitude,
        longitude,
    };

    destinationInput.value = destination.displayName;

    if (destinationMarker) {
        map.removeLayer(destinationMarker);
    }

    destinationMarker = L.marker(clickedPosition)
        .addTo(map)
        .bindPopup("Selected destination")
        .openPopup();

    updateJourneyControls();
    showLocationMessage("Destination selected. Finding its address...");

    try {
        const response = await fetch(
            `/api/reverse-geocode?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
            { signal: controller.signal }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message || "Unable to identify this location."
            );
        }

        if (selectionId !== mapSelectionId) return;

        destination = {
            name: result.name || "Selected destination",
            displayName:
                result.displayName || destination.displayName,
            latitude,
            longitude,
        };

        destinationInput.value = destination.displayName;

        destinationMarker.setLatLng(clickedPosition);
        destinationMarker
            .bindPopup(destination.displayName)
            .openPopup();
    } catch (error) {
        if (error.name === "AbortError") return;
        if (selectionId !== mapSelectionId) return;

        destinationInput.value =
            `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

        destination = {
            name: "Selected destination",
            displayName: destinationInput.value,
            latitude,
            longitude,
        };

        destinationMarker.setLatLng(clickedPosition);
        destinationMarker
            .bindPopup(destination.displayName)
            .openPopup();
    } finally {
        if (selectionId === mapSelectionId) {
            mapSelectionController = null;
        }
    }

    if (selectionId !== mapSelectionId || !destination) return;

    updateJourneyControls();

    if (myPosition) {
        await getRoute();
        hideLocationMessage();
    } else {
        showLocationMessage(
            "Destination selected. You can start your journey; your current location will be requested if needed."
        );
    }
});

// --------------------------------------------------
// ROUTING THROUGH EXPRESS BACKEND
// --------------------------------------------------

async function getRoute({ fitMap = true } = {}) {
    if (!myPosition || !destination) {
        showLocationMessage(
            !myPosition
                ? "Tap Share Location to get your current location first."
                : "Search for and select a destination first."
        );

        return false;
    }

    cancelActiveRouteRequest();

    const requestId = activeRouteRequestId;
    const controller = new AbortController();

    routeRequestController = controller;
    routeRequestInProgress = true;

    const [startLatitude, startLongitude] = [...myPosition];
    const requestedDestination = { ...destination };
    const requestedMode = selectedMode;

    if (!routeLayer) {
        showLocationMessage("Calculating route...");
    }

    try {
        const response = await fetch("/api/route", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            signal: controller.signal,
            body: JSON.stringify({
                startLatitude,
                startLongitude,
                endLatitude: requestedDestination.latitude,
                endLongitude: requestedDestination.longitude,
                mode: requestedMode,
            }),
        });

        const data = await response.json();

        if (requestId !== activeRouteRequestId) {
            return false;
        }

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to calculate route."
            );
        }

        const coordinates = data.geometry?.coordinates;

        if (
            data.geometry?.type !== "LineString" ||
            !Array.isArray(coordinates) ||
            coordinates.length < 2 ||
            !coordinates.every(
                (point) =>
                    Array.isArray(point) &&
                    point.length >= 2 &&
                    Number.isFinite(point[0]) &&
                    Number.isFinite(point[1]) &&
                    Math.abs(point[0]) <= 180 &&
                    Math.abs(point[1]) <= 90
            ) ||
            !Number.isFinite(data.distance) ||
            data.distance < 0 ||
            !Number.isFinite(data.duration) ||
            data.duration < 0
        ) {
            throw new Error(
                "The routing service returned an invalid route."
            );
        }

        const newRouteLayer = L.geoJSON(data.geometry, {
            style: {
                color: "#303031",
                weight: 6,
                opacity: 0.85,
            },
        });

        const bounds = newRouteLayer.getBounds();

        if (!bounds.isValid()) {
            throw new Error("The routing service returned an empty route.");
        }

        if (requestId !== activeRouteRequestId) {
            return false;
        }

        newRouteLayer.addTo(map);

        if (routeLayer) {
            map.removeLayer(routeLayer);
        }

        routeLayer = newRouteLayer;

        if (fitMap) {
            map.fitBounds(bounds, {
                paddingTopLeft: [25, 105],
                paddingBottomRight: [25, 45],
                maxZoom: 16,
            });
        }

        routeDistance.textContent =
            data.distance >= 1000
                ? `${(data.distance / 1000).toFixed(1)} km`
                : `${Math.round(data.distance)} m`;

        routeDuration.textContent =
            data.duration >= 3600
                ? `${Math.floor(data.duration / 3600)} hr ${Math.round(
                      (data.duration % 3600) / 60
                  )} min`
                : `${Math.max(1, Math.round(data.duration / 60))} min`;

        routeSummary.classList.remove("hidden");
        clearRouteButton.classList.remove("hidden");
        hideLocationMessage();

        return true;
    } catch (error) {
        if (requestId !== activeRouteRequestId) {
            return false;
        }

        if (error.name === "AbortError") {
            return false;
        }

        console.error("Route calculation failed:", error);

        showLocationMessage(
            error.message || "Unable to calculate route."
        );

        return false;
    } finally {
        if (requestId === activeRouteRequestId) {
            routeRequestInProgress = false;
            routeRequestController = null;
        }
    }
}

// --------------------------------------------------
// CLEAR ROUTE
// --------------------------------------------------

clearRouteButton.addEventListener("click", () => {
    setMapSelectionMode(false);

    mapSelectionId += 1;
    mapSelectionController?.abort();
    mapSelectionController = null;

    cancelActiveRouteRequest();
    liveRouteService?.reset();

    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }

    if (destinationMarker) {
        map.removeLayer(destinationMarker);
        destinationMarker = null;
    }

    destination = null;
    destinationInput.value = "";

    clearTimeout(searchTimer);

    if (searchController) {
        searchController.abort();
        searchController = null;
    }

    latestSearchId += 1;

    searchButton.disabled = false;
    searchButton.textContent = "Search";

    routeSummary.classList.add("hidden");
    clearRouteButton.classList.add("hidden");

    searchResults.classList.add("hidden");
    searchResults.replaceChildren();

    updateJourneyControls();

    showLocationMessage("Route cleared.");
});
// --------------------------------------------------
// LOGOUT
// --------------------------------------------------

logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out...";

    try {
        const response = await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin",
        });

        if (!response.ok) {
            throw new Error("Unable to log out. Please try again.");
        }

        // Stop local location sharing before leaving the page.
        stopSharing("You have logged out.");

        window.location.replace("/login");
    } catch (error) {
        console.error("Logout failed:", error);

        showLocationMessage(
            error.message || "Unable to log out. Please try again."
        );

        logoutButton.disabled = false;
        logoutButton.textContent = "Logout";
    }
});
// --------------------------------------------------
// INITIAL UI
// --------------------------------------------------

updateShareButton();
setMapSelectionMode(false);
updateJourneyControls();

planJourneyButton?.setAttribute(
    "aria-expanded",
    String(journeyPlanner && !journeyPlanner.classList.contains("hidden"))
);

loadActiveJourney();

// The Friends page now handles friend activity.
if (refreshFriendsJourneysButton) {
    refreshFriendsJourneys();
}
