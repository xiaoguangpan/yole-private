const simplifiedValue = import.meta.env.VITE_YOLE_SIMPLIFIED_UI;

export const YOLE_SIMPLIFIED_UI =
  simplifiedValue === undefined
    ? true
    : simplifiedValue !== "0" && simplifiedValue.toLowerCase() !== "false";
