
export class LiveRouteService {
    constructor({ intervalMs, minMovementMeters, onUpdate }) {
        this.intervalMs = intervalMs;
        this.minMovementMeters = minMovementMeters;
        this.onUpdate = onUpdate;

        this.lastRoutedPosition = null;
        this.latestPosition = null;
        this.lastUpdateTime = 0;
        this.timer = null;
        this.destroyed = false;
    }

    distanceInMeters(a, b) {
        const radians = (degrees) => (degrees * Math.PI) / 180;

        const [lat1, lon1] = a;
        const [lat2, lon2] = b;

        const dLat = radians(lat2 - lat1);
        const dLon = radians(lon2 - lon1);

        const value =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(radians(lat1)) *
                Math.cos(radians(lat2)) *
                Math.sin(dLon / 2) ** 2;

        // Protect against floating-point rounding errors.
        const boundedValue = Math.max(0, Math.min(1, value));

        return (
            6371000 *
            2 *
            Math.atan2(
                Math.sqrt(boundedValue),
                Math.sqrt(1 - boundedValue)
            )
        );
    }

    updatePosition(position) {
        if (this.destroyed) return;

        if (
            !Array.isArray(position) ||
            position.length !== 2 ||
            !position.every(Number.isFinite) ||
            Math.abs(position[0]) > 90 ||
            Math.abs(position[1]) > 180
        ) {
            return;
        }

        this.latestPosition = [...position];

        if (this.lastRoutedPosition) {
            const distance = this.distanceInMeters(
                this.lastRoutedPosition,
                this.latestPosition
            );

            if (distance < this.minMovementMeters) return;
        }

        this.schedule();
    }

    schedule() {
        if (this.destroyed || this.timer !== null) return;

        const elapsed = Date.now() - this.lastUpdateTime;
        const delay = Math.max(0, this.intervalMs - elapsed);

        this.timer = setTimeout(() => {
            this.timer = null;

            if (this.destroyed || !this.latestPosition) return;

            if (this.lastRoutedPosition) {
                const distance = this.distanceInMeters(
                    this.lastRoutedPosition,
                    this.latestPosition
                );

                if (distance < this.minMovementMeters) return;
            }

            // Do not mark this position as routed yet.
            const positionToRoute = [...this.latestPosition];

            Promise.resolve()
                .then(() => this.onUpdate(positionToRoute))
                .then((success) => {
                    if (this.destroyed || success === false) return;

                    this.lastRoutedPosition = positionToRoute;
                    this.lastUpdateTime = Date.now();

                    // If the user moved while routing, schedule another update.
                    if (this.latestPosition) {
                        const distance = this.distanceInMeters(
                            this.lastRoutedPosition,
                            this.latestPosition
                        );

                        if (distance >= this.minMovementMeters) {
                            this.schedule();
                        }
                    }
                })
                .catch((error) => {
                    console.error("Live route update failed:", error);
                    // The position remains uncommitted, allowing a later retry.
                });
        }, delay);
    }

    reset() {
        if (this.timer !== null) {
            clearTimeout(this.timer);
        }

        this.timer = null;
        this.lastRoutedPosition = null;
        this.latestPosition = null;
        this.lastUpdateTime = 0;
    }

    destroy() {
        this.reset();
        this.destroyed = true;
    }
}
