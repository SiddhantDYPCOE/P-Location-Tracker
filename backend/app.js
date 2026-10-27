
import express from "express";
import { Server } from "socket.io";
import path from "path";
import http from "http";
import https from "https";
import fs from "fs";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";

import { getRoute } from "./public/js/services/route.service.js";

import authRoutes from "./src/modules/auth/auth.routes.js";
import friendsRoutes from "./src/modules/friends/friends.routes.js";
import journeysRoutes from "./src/modules/journeys/journey.routes.js";

import { authenticateSocket } from "./src/middleware/socket-auth.middleware.js";
import { registerJourneySocket } from "./src/modules/journeys/journey.socket.js";
import { requirePageAuth } from "./src/middleware/require-page-auth.middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(cookieParser());

// --------------------------------------------------
// SERVER CONFIGURATION
// Render: HTTP using Render's assigned PORT.
// Local: HTTPS when local certificates are available.
// --------------------------------------------------

const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.RENDER === "true" ||
    Boolean(process.env.RENDER_SERVICE_ID);

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const keyPath = path.resolve(
    __dirname,
    "../192.168.1.22+2-key.pem"
);

const certPath = path.resolve(
    __dirname,
    "../192.168.1.22+2.pem"
);

let server;
let protocol = "HTTP";

if (
    !isProduction &&
    fs.existsSync(keyPath) &&
    fs.existsSync(certPath)
) {
    // Local development with HTTPS certificates.
    server = https.createServer(
        {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
        },
        app
    );

    protocol = "HTTPS";
} else {
    // Render terminates public HTTPS and forwards HTTP to this service.
    server = http.createServer(app);
}

const io = new Server(server);

io.use(authenticateSocket);

const journeyIo = io.of("/journeys");
journeyIo.use(authenticateSocket);

registerJourneySocket(journeyIo);

// --------------------------------------------------
// EXPRESS CONFIGURATION
// --------------------------------------------------

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

// --------------------------------------------------
// GEOCODING
// --------------------------------------------------

const geocodeCache = new Map();

let geocodeQueue = Promise.resolve();
let lastGeocodeRequestAt = 0;

app.get("/api/geocode", async (req, res) => {
    const query = String(req.query.q || "").trim();

    if (query.length < 3 || query.length > 200) {
        return res.status(400).json({
            message: "Enter between 3 and 200 characters.",
        });
    }

    try {
        const url = new URL("https://photon.komoot.io/api/");

        url.searchParams.set("q", query);
        url.searchParams.set("limit", "6");
        url.searchParams.set("lang", "en");

        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            throw new Error(`Photon returned HTTP ${response.status}`);
        }

        const data = await response.json();

        const results = (data.features || [])
            .filter((feature) => {
                const coordinates = feature.geometry?.coordinates;

                return (
                    Array.isArray(coordinates) &&
                    Number.isFinite(coordinates[0]) &&
                    Number.isFinite(coordinates[1])
                );
            })
            .map((feature) => {
                const properties = feature.properties || {};
                const [longitude, latitude] =
                    feature.geometry.coordinates;

                const name =
                    properties.name ||
                    properties.street ||
                    properties.city ||
                    "Unknown place";

                const address = [
                    properties.street &&
                    properties.street !== name
                        ? properties.street
                        : null,
                    properties.city ||
                        properties.locality ||
                        properties.district,
                    properties.state,
                    properties.country,
                ].filter(Boolean);

                return {
                    name,
                    displayName: [
                        ...new Set([name, ...address]),
                    ].join(", "),
                    latitude,
                    longitude,
                };
            });

        res.set("Cache-Control", "no-store");

        return res.json(results);
    } catch (error) {
        console.error("Autocomplete failed:", error.message);

        return res.status(502).json({
            message:
                "Suggestions are temporarily unavailable. Please try again.",
        });
    }
});

// --------------------------------------------------
// REVERSE GEOCODING
// --------------------------------------------------

app.get("/api/reverse-geocode", async (req, res) => {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
    ) {
        return res.status(400).json({
            message: "Valid latitude and longitude are required.",
        });
    }

    try {
        const url = new URL(
            "https://photon.komoot.io/reverse"
        );

        url.searchParams.set("lat", String(latitude));
        url.searchParams.set("lon", String(longitude));

        const response = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            headers: {
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            return res.status(502).json({
                message: "Unable to identify this location.",
            });
        }

        const data = await response.json();
        const feature = data.features?.[0];
        const properties = feature?.properties;

        const name =
            properties?.name ||
            properties?.street ||
            properties?.locality ||
            properties?.city ||
            properties?.district ||
            "Selected map location";

        const displayName = [
            properties?.name,
            properties?.street,
            properties?.locality,
            properties?.city,
            properties?.state,
            properties?.country,
        ]
            .filter(
                (value, index, array) =>
                    value && array.indexOf(value) === index
            )
            .join(", ") ||
            `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

        return res.json({
            name,
            displayName,
            latitude,
            longitude,
        });
    } catch (error) {
        console.error(
            "Reverse geocoding failed:",
            error.message
        );

        return res.status(502).json({
            message:
                "Unable to identify this location right now.",
        });
    }
});

// --------------------------------------------------
// CLIENT CONFIGURATION
// --------------------------------------------------

app.get("/api/config", (req, res) => {
    res.set("Cache-Control", "no-store");

    res.json({
        liveRouteUpdateIntervalMs: Number(
            process.env.LIVE_ROUTE_UPDATE_INTERVAL_MS || 5000
        ),
        liveRouteMinMovementMeters: Number(
            process.env.LIVE_ROUTE_MIN_MOVEMENT_METERS || 20
        ),
    });
});

// --------------------------------------------------
// ROUTE CALCULATION
// --------------------------------------------------

app.post("/api/route", async (req, res) => {
    const {
        startLatitude,
        startLongitude,
        endLatitude,
        endLongitude,
        mode = "car",
    } = req.body || {};

    const coordinates = [
        startLatitude,
        startLongitude,
        endLatitude,
        endLongitude,
    ];

    if (
        !coordinates.every(
            (value) =>
                typeof value === "number" &&
                Number.isFinite(value)
        ) ||
        Math.abs(startLatitude) > 90 ||
        Math.abs(endLatitude) > 90 ||
        Math.abs(startLongitude) > 180 ||
        Math.abs(endLongitude) > 180
    ) {
        return res.status(400).json({
            message:
                "Valid numeric route coordinates are required.",
        });
    }

    if (!["car", "bike", "foot"].includes(mode)) {
        return res.status(400).json({
            message: "Invalid travel mode.",
        });
    }

    try {
        const route = await getRoute({
            startLatitude,
            startLongitude,
            endLatitude,
            endLongitude,
            mode,
        });

        return res.json(route);
    } catch (error) {
        console.error(
            "Route request failed:",
            error.message
        );

        return res.status(502).json({
            message:
                error.message ===
                "No route found for this travel mode."
                    ? error.message
                    : "Routing service is temporarily unavailable.",
        });
    }
});

// --------------------------------------------------
// PAGE AND API ROUTES
// --------------------------------------------------

app.get("/", requirePageAuth, (req, res) => {
    res.render("index");
});
// --------------------------------------------------
// PAGE AND API ROUTES
// --------------------------------------------------

// Login page
app.get("/login", (req, res) => {
    res.render("auth");
});

// Optional registration URL
app.get("/register", (req, res) => {
    res.redirect("/login");
});

// Main map page
app.get("/", requirePageAuth, (req, res) => {
    res.render("index");
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/journeys", journeysRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/journeys", journeysRoutes);

// --------------------------------------------------
// SOCKET.IO LOCATION SHARING
// --------------------------------------------------

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("send-location", (data) => {
        if (
            typeof data?.latitude !== "number" ||
            typeof data?.longitude !== "number" ||
            !Number.isFinite(data.latitude) ||
            !Number.isFinite(data.longitude) ||
            data.latitude < -90 ||
            data.latitude > 90 ||
            data.longitude < -180 ||
            data.longitude > 180
        ) {
            return;
        }

        const locationData = {
            id: socket.id,
            latitude: data.latitude,
            longitude: data.longitude,
        };

        // Notify other connected users.
        socket.broadcast.emit(
            "receive-location",
            locationData
        );

        // Echo the location to the sender.
        socket.emit("receive-location", locationData);
    });

    socket.on("stop-sharing", () => {
        console.log(
            "User stopped sharing:",
            socket.id
        );

        io.emit("user-disconnected", socket.id);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        io.emit("user-disconnected", socket.id);
    });
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

server.listen(PORT, HOST, () => {
    console.log(
        `${protocol} server running on ${HOST}:${PORT}`
    );

    if (!isProduction) {
        console.log(
            `Local URL: ${protocol.toLowerCase()}://localhost:${PORT}`
        );
    }
});

// --------------------------------------------------
// SERVER ERRORS
// --------------------------------------------------

server.on("error", (error) => {
    console.error("Server error:", error);
});
