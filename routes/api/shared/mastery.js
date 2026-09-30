function normalizeConceptName(value) {
    const text = String(value ?? "").trim().replace(/\s+/g, " ");
    return text ? text.toLowerCase() : "";
}

function normalizeConceptList(value) {
    const items = Array.isArray(value) ? value : (value == null ? [] : [value]);
    const normalized = [];
    const seen = new Set();

    for (const item of items) {
        const concept = normalizeConceptName(item);

        if (!concept || seen.has(concept)) {
            continue;
        }

        seen.add(concept);
        normalized.push(concept);
    }

    return normalized;
}

function normalizeMasteryEntry(entry) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
        return {
            score: roundScore(entry),
            subject: null,
            chapter: null
        };
    }

    if (entry && typeof entry === "object") {
        const score = Number(entry.score);

        if (Number.isFinite(score)) {
            return {
                score: roundScore(score),
                subject: typeof entry.subject === "string" ? entry.subject.trim().toLowerCase() : entry.subject ?? null,
                chapter: entry.chapter == null ? null : String(entry.chapter).trim()
            };
        }
    }

    return null;
}

function normalizeMastery(mastery) {
    const normalized = {};

    if (!mastery || typeof mastery !== "object") {
        return normalized;
    }

    for (const [concept, entry] of Object.entries(mastery)) {
        const normalizedEntry = normalizeMasteryEntry(entry);
        const normalizedConcept = normalizeConceptName(concept);

        if (!normalizedEntry || !normalizedConcept) {
            continue;
        }

        if (normalized[normalizedConcept]) {
            const previous = normalized[normalizedConcept];
            normalized[normalizedConcept] = {
                score: roundScore(Math.max(previous.score ?? 0, normalizedEntry.score ?? 0)),
                subject: previous.subject ?? normalizedEntry.subject ?? null,
                chapter: previous.chapter ?? normalizedEntry.chapter ?? null
            };
        } else {
            normalized[normalizedConcept] = normalizedEntry;
        }
    }

    return normalized;
}

function getMasteryScore(entry) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
        return entry;
    }

    if (entry && typeof entry === "object") {
        const score = Number(entry.score);
        return Number.isFinite(score) ? score : null;
    }

    return null;
}

function calculateTier(mastery) {
    const scores = Object.values(mastery)
        .map(getMasteryScore)
        .filter((score) => Number.isFinite(score));

    if (scores.length === 0) {
        return "C";
    }

    const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    if (avg <= 0.2) return "D";
    if (avg <= 0.5) return "C";
    if (avg <= 0.7) return "B";
    return "A";
}

function roundScore(score, precision = 4) {
    if (!Number.isFinite(score)) {
        return null;
    }

    const rounded = roundNumber(score, precision);

    if (!Number.isFinite(rounded)) {
        return null;
    }

    return Math.max(0, Math.min(1, rounded));
}

function roundNumber(value, precision = 4) {
    if (!Number.isFinite(value)) {
        return null;
    }

    const factor = 10 ** precision;

    return Math.round((value + Number.EPSILON) * factor) / factor; //sometimes multiplication with decimals behaves really wierdly in js, so to make sure that doesn't happen, we use epsilon to nudge the number forward a lil bit
}

export {
    normalizeConceptName,
    normalizeConceptList,
    normalizeMasteryEntry,
    normalizeMastery,
    getMasteryScore,
    calculateTier,
    roundScore,
    roundNumber
};