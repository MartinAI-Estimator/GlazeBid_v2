/**
 * Calculates Simple Span Deflection
 * w = Wind Load (PSF) converted to lbs/inch
 * L = Length (Inches)
 * E = Modulus of Elasticity (Aluminum = 10,000,000 psi)
 * I = Moment of Inertia (in^4)
 */
export const calculateDeflection = (w, L, I) => {
    const E = 10000000;
    const load_per_inch = (w * (2/12)); // Simplified assuming 2ft tributary width
    const deflection = (5 * load_per_inch * Math.pow(L, 4)) / (384 * E * I);
    
    const limit = L / 175; // Industry standard limit
    return {
        value: deflection.toFixed(3),
        pass: deflection <= limit,
        limit: limit.toFixed(3)
    };
};
