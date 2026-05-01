export const DEMAND_SCOPES = Object.freeze({
    city: "city",
    property: "property",
});

export const DEMAND_COLLECTION_PATHS = Object.freeze({
    watchlist: "demand_watchlist",
    pricing: "demand_pricing",
    overrides: "demand_overrides",
});

export const DEFAULT_DEMAND_PRICING_SETTINGS = Object.freeze({
    enabled: true,
    emergencyDisabled: false,
    recalculationMinutes: 15,
    warningThresholdPercent: 60,
    globalMaxCapPercent: 100,
    ownerOverrideExpiryHour: 6,
    propertyThresholds: [
        { minOccupancyPercent: 90, multiplierPercent: 50 },
        { minOccupancyPercent: 70, multiplierPercent: 20 },
    ],
    cityThresholds: [
        { minOccupancyPercent: 90, multiplierPercent: 100 },
        { minOccupancyPercent: 80, multiplierPercent: 30 },
    ],
});

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function nonNegativePercent(value, fallback = 0) {
    return Math.max(0, finiteNumber(value, fallback));
}

function normalizeThresholds(thresholds) {
    return [...thresholds]
        .map((item) => ({
            minOccupancyPercent: nonNegativePercent(item.minOccupancyPercent ?? item.min),
            multiplierPercent: nonNegativePercent(item.multiplierPercent ?? item.increasePercent),
        }))
        .sort((a, b) => b.minOccupancyPercent - a.minOccupancyPercent);
}

function scopeThresholds(scope, settings) {
    if (scope === DEMAND_SCOPES.property) {
        return settings.propertyThresholds ?? DEFAULT_DEMAND_PRICING_SETTINGS.propertyThresholds;
    }
    if (scope === DEMAND_SCOPES.city) {
        return settings.cityThresholds ?? DEFAULT_DEMAND_PRICING_SETTINGS.cityThresholds;
    }
    return [];
}

export function calculateOccupancyPercent({ occupiedBeds, activeBookableBeds }) {
    const occupied = Math.max(0, finiteNumber(occupiedBeds));
    const active = Math.max(0, finiteNumber(activeBookableBeds));
    if (active <= 0) {
        return 0;
    }
    return Number(Math.min(100, (occupied / active) * 100).toFixed(2));
}

export function isDemandWarningActive(occupancyPercent, settings = {}) {
    const threshold = nonNegativePercent(
        settings.warningThresholdPercent,
        DEFAULT_DEMAND_PRICING_SETTINGS.warningThresholdPercent
    );
    return nonNegativePercent(occupancyPercent) >= threshold;
}

export function getDemandMultiplierPercent(scope, occupancyPercent, settings = {}) {
    const mergedSettings = { ...DEFAULT_DEMAND_PRICING_SETTINGS, ...settings };
    if (!mergedSettings.enabled || mergedSettings.emergencyDisabled) {
        return 0;
    }

    const occupancy = nonNegativePercent(occupancyPercent);
    const globalMaxCap = nonNegativePercent(
        mergedSettings.globalMaxCapPercent,
        DEFAULT_DEMAND_PRICING_SETTINGS.globalMaxCapPercent
    );
    const matchedThreshold = normalizeThresholds(scopeThresholds(scope, mergedSettings))
        .find((threshold) => occupancy >= threshold.minOccupancyPercent);

    if (!matchedThreshold) {
        return 0;
    }
    return Math.min(matchedThreshold.multiplierPercent, globalMaxCap);
}

export function getFinalDemandMultiplierPercent({
    propertyMultiplierPercent = 0,
    cityMultiplierPercent = 0,
    globalMaxCapPercent = DEFAULT_DEMAND_PRICING_SETTINGS.globalMaxCapPercent,
} = {}) {
    return Math.min(
        Math.max(
            nonNegativePercent(propertyMultiplierPercent),
            nonNegativePercent(cityMultiplierPercent)
        ),
        nonNegativePercent(globalMaxCapPercent, DEFAULT_DEMAND_PRICING_SETTINGS.globalMaxCapPercent)
    );
}

export function applyDemandMultiplier(baseAmount, multiplierPercent = 0) {
    const amount = Math.max(0, finiteNumber(baseAmount));
    const multiplier = nonNegativePercent(multiplierPercent);
    return Math.round(amount * (1 + multiplier / 100));
}

export function getNextDemandOverrideExpiry(now = new Date(), settings = {}) {
    const expiryHour = Math.min(
        23,
        Math.max(0, Math.round(finiteNumber(
            settings.ownerOverrideExpiryHour,
            DEFAULT_DEMAND_PRICING_SETTINGS.ownerOverrideExpiryHour
        )))
    );
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + 1);
    expiry.setHours(expiryHour, 0, 0, 0);
    return expiry;
}

export function buildDemandPricingReason(scope, occupancyPercent, multiplierPercent) {
    const label = scope === DEMAND_SCOPES.city ? "city" : "property";
    const occupancy = Math.round(nonNegativePercent(occupancyPercent));
    const multiplier = Math.round(nonNegativePercent(multiplierPercent));
    if (multiplier <= 0) {
        return `${label} occupancy is ${occupancy}%, so demand pricing is not active`;
    }
    return `${label} occupancy is ${occupancy}%, so demand pricing adds ${multiplier}%`;
}
