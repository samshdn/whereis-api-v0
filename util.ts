import { crypto } from "https://deno.land/std@0.200.0/crypto/mod.ts";

export async function loadJSONFromFs(
    filePath: string,
): Promise<Record<string, any>> {
    try {
        // read file content
        const jsonString = await Deno.readTextFile(filePath);
        // parse
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error loading JSON file:", error);
        throw error;
    }
}

// Calculate MD5 value from JSON object
export async function jsonToMd5(
    json: Record<string, unknown>,
): Promise<string> {
    // Convert JSON object to string
    const jsonString = JSON.stringify(json);

    // Convert json stringto Uint8Array
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonString);

    // Calcualte MD5
    const hashBuffer = await crypto.subtle.digest("MD5", data);

    // Convert HASH value to Hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
