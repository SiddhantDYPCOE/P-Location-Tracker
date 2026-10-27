
const ROUTING_URLS = {
    car:
        process.env.ROUTING_CAR_URL ||
        "https://routing.openstreetmap.de/routed-car/route/v1/driving",

    bike:
        process.env.ROUTING_BIKE_URL ||
        "https://routing.openstreetmap.de/routed-bike/route/v1/driving",

    foot:
        process.env.ROUTING_FOOT_URL ||
        "https://routing.openstreetmap.de/routed-foot/route/v1/driving",
};

const ROUTING_TIMEOUT_MS = Number(
    process.env.ROUTING_REQUEST_TIMEOUT_MS || 15000
);

export const getRoute = async ({
    startLatitude,
    startLongitude,
    endLatitude,
    endLongitude,
    mode = "car",
}) => {
    const coordinates = [
        startLatitude,
        startLongitude,
        endLatitude,
        endLongitude,
    ];

    if (!coordinates.every(Number.isFinite)) {
        throw new Error("Invalid route coordinates.");
    }

    if (
        Math.abs(startLatitude) > 90 ||
        Math.abs(endLatitude) > 90 ||
        Math.abs(startLongitude) > 180 ||
        Math.abs(endLongitude) > 180
    ) {
        throw new Error("Route coordinates are out of range.");
    }

    const routingUrl = ROUTING_URLS[mode];

    if (!routingUrl) {
        throw new Error("Invalid travel mode.");
    }

    const url =
        `${routingUrl}/${startLongitude},${startLatitude};` +
        `${endLongitude},${endLatitude}` +
        "?overview=full&geometries=geojson&steps=false";

    const response = await fetch(url, {
        signal: AbortSignal.timeout(ROUTING_TIMEOUT_MS),
        headers: {
            Accept: "application/json",
        },
    });

    if (!response.ok) {
        throw new Error("Routing service is temporarily unavailable.");
    }

    const data = await response.json();

    if (data.code !== "Ok" || !data.routes?.length) {
        throw new Error("No route found for this travel mode.");
    }

    const route = data.routes[0];

    return {
        distance: route.distance,
        duration: route.duration,
        geometry: route.geometry,
    };
};
