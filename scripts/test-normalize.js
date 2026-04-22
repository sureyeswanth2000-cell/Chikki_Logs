function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, "");
    
    // If it starts with '+', return it as-is with only digits
    if (raw.trim().startsWith("+")) {
        return `+${digits}`;
    }

    // Special handles for known country codes or common patterns
    if (digits.startsWith("966") && digits.length >= 10 && digits.length <= 12) {
        // Saudi Arabia: 966 prefix detected
        return `+${digits}`;
    }

    if (digits.length === 10) {
        // Default to Indian if it's 10 digits and doesn't look like another country code
        return `+91${digits}`;
    }
    
    if (digits.length === 12 && digits.startsWith("91")) {
        // Indian number with 91 prefix
        return `+${digits}`;
    }

    if (digits.length >= 11) {
        // If it's long but doesn't have '+', just prepend '+' and hope it's valid
        return `+${digits}`;
    }

    throw new Error("Enter a valid phone number with country code.");
}

const tests = [
    { input: "9666141932", expected: "+9666141932" },
    { input: "+9666141932", expected: "+9666141932" },
    { input: "8374532598", expected: "+918374532598" },
    { input: "+918374532598", expected: "+918374532598" },
    { input: "918374532598", expected: "+918374532598" },
    { input: "0501234567", expected: "+910501234567" }, // This is ambiguous, but currently defaults to +91
];

tests.forEach(({ input, expected }) => {
    const result = normalizePhone(input);
    console.log(`Input: ${input} -> Result: ${result} | ${result === expected ? "PASS" : "FAIL"}`);
});
